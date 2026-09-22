package opencode

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"composer/internal/domain"
	"composer/internal/logger"
	"composer/internal/provider"
)

type serverEntry struct {
	server   *server
	api      *httpClient
	streamed context.CancelFunc
}

// Adapter talks to managed (or external) OpenCode HTTP servers. Servers are
// managed per working directory so each project/worktree runs in its own context.
type Adapter struct {
	settings domain.ProviderSettings
	emit     provider.Emitter
	client   *http.Client

	starting sync.Mutex
	mu       sync.RWMutex
	servers  map[string]*serverEntry

	threads          map[string]*thread
	bySession        map[string]*thread
	pending          map[string]string
	pendingQuestions map[string]string
}

type thread struct {
	threadID   string
	sessionID  string
	model      string
	permission domain.PermissionMode
	api        *httpClient

	mu           sync.Mutex
	turnID       string
	tools        map[string]string
	messageRoles map[string]string
	lastUserText string
}

func NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) *Adapter {
	return &Adapter{
		settings:         settings,
		emit:             emit,
		client:           &http.Client{Timeout: 0},
		servers:          make(map[string]*serverEntry),
		threads:          make(map[string]*thread),
		bySession:        make(map[string]*thread),
		pending:          make(map[string]string),
		pendingQuestions: make(map[string]string),
	}
}

func (a *Adapter) Driver() domain.DriverKind { return domain.DriverOpenCode }

func (a *Adapter) Capabilities() provider.Capabilities {
	return provider.Capabilities{SessionModelSwitch: true, Resume: true, Approvals: true}
}

func (a *Adapter) ensureServer(ctx context.Context, cwd string) (*httpClient, error) {
	clean := filepath.Clean(cwd)
	if clean == "" || clean == "." {
		if wd, err := os.Getwd(); err == nil {
			clean = filepath.Clean(wd)
		}
	}

	a.mu.RLock()
	if entry, ok := a.servers[clean]; ok && entry.api != nil {
		api := entry.api
		a.mu.RUnlock()
		return api, nil
	}
	a.mu.RUnlock()

	a.starting.Lock()
	defer a.starting.Unlock()

	a.mu.RLock()
	if entry, ok := a.servers[clean]; ok && entry.api != nil {
		api := entry.api
		a.mu.RUnlock()
		return api, nil
	}
	a.mu.RUnlock()

	srv, err := startServer(ctx, a.settings, a.client, clean)
	if err != nil {
		return nil, err
	}

	api := &httpClient{base: srv.baseURL, client: a.client}
	streamCtx, cancel := context.WithCancel(context.Background())

	a.mu.Lock()
	a.servers[clean] = &serverEntry{server: srv, api: api, streamed: cancel}
	a.mu.Unlock()

	go a.streamEvents(streamCtx, srv.baseURL)
	return api, nil
}

// streamEvents keeps the SSE subscription alive for the life of the server,
// reconnecting on transient drops.
func (a *Adapter) streamEvents(ctx context.Context, baseURL string) {
	for {
		err := subscribe(ctx, a.client, baseURL, a.handleEvent)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(500 * time.Millisecond):
			}
		}
	}
}

func (a *Adapter) StartSession(ctx context.Context, in domain.SessionStartInput) (domain.Session, error) {
	cwd := in.Cwd
	if cwd == "" {
		if wd, err := os.Getwd(); err == nil {
			cwd = wd
		}
	}
	in.Cwd = cwd
	api, err := a.ensureServer(ctx, cwd)
	if err != nil {
		return domain.Session{}, err
	}

	model := in.Model
	if model == "" {
		model = a.settings.Model
	}

	t := &thread{
		threadID:     in.ThreadID,
		model:        model,
		permission:   in.Permission,
		api:          api,
		tools:        make(map[string]string),
		messageRoles: make(map[string]string),
	}

	if in.Resume != "" {
		var existing Session
		if err := api.do(ctx, http.MethodGet, "/session/"+in.Resume, nil, &existing); err == nil && existing.ID != "" {
			t.sessionID = existing.ID
		}
	}
	if t.sessionID == "" {
		var created Session
		if err := api.do(ctx, http.MethodPost, "/session", CreateSessionRequest{Title: in.ThreadID}, &created); err != nil {
			return domain.Session{}, err
		}
		t.sessionID = created.ID
	}

	a.mu.Lock()
	a.threads[in.ThreadID] = t
	a.bySession[t.sessionID] = t
	a.mu.Unlock()

	logger.Infof("OpenCode", "Session started: thread=%s sessionID=%s model=%s", in.ThreadID, t.sessionID, model)

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventSessionStarted, ThreadID: in.ThreadID, Driver: domain.DriverOpenCode,
	})

	return domain.Session{
		ThreadID:          in.ThreadID,
		InstanceID:        in.InstanceID,
		Driver:            domain.DriverOpenCode,
		ProviderSessionID: t.sessionID,
		Cwd:               in.Cwd,
		Model:             model,
		StartedAt:         time.Now().UnixMilli(),
	}, nil
}

func (a *Adapter) SendTurn(ctx context.Context, in domain.SendTurnInput) error {
	a.mu.RLock()
	t := a.threads[in.ThreadID]
	a.mu.RUnlock()
	if t == nil || t.api == nil {
		logger.Errorf("OpenCode", "SendTurn failed: no active session for thread %s", in.ThreadID)
		return errors.New("no active session for thread " + in.ThreadID)
	}
	api := t.api

	parts := make([]any, 0, len(in.Files)+1)
	if in.Text != "" {
		parts = append(parts, TextPart{Type: "text", Text: in.Text})
	}
	for _, file := range in.Files {
		parts = append(parts, FilePart{Type: "file", MIME: file.MIME, URL: "file://" + file.Path})
	}

	preview := in.Text
	if len(preview) > 100 {
		preview = preview[:100] + "..."
	}
	logger.Infof("OpenCode", "SendTurn: thread=%s turn=%s prompt=%q files=%d model=%s", in.ThreadID, in.TurnID, preview, len(in.Files), t.model)

	t.mu.Lock()
	t.turnID = in.TurnID
	t.lastUserText = in.Text
	t.mu.Unlock()

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnStarted, ThreadID: in.ThreadID, TurnID: in.TurnID, Driver: domain.DriverOpenCode,
	})

	request := PromptRequest{Model: parseModelRef(t.model), Parts: parts}
	if err := api.do(ctx, http.MethodPost, "/session/"+t.sessionID+"/prompt_async", request, nil); err != nil {
		t.mu.Lock()
		t.turnID = ""
		t.mu.Unlock()
		logger.Errorf("OpenCode", "prompt_async failed: %v", err)
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventTurnFailed, ThreadID: in.ThreadID, TurnID: in.TurnID,
			Driver: domain.DriverOpenCode, Error: err.Error(),
		})
		return err
	}
	logger.Infof("OpenCode", "prompt_async accepted for session %s", t.sessionID)
	return nil
}

func (a *Adapter) InterruptTurn(ctx context.Context, threadID string) error {
	a.mu.RLock()
	t := a.threads[threadID]
	a.mu.RUnlock()
	if t == nil || t.api == nil {
		return nil
	}
	logger.Infof("OpenCode", "InterruptTurn: thread=%s session=%s", threadID, t.sessionID)
	return t.api.do(ctx, http.MethodPost, "/session/"+t.sessionID+"/abort", nil, nil)
}

func (a *Adapter) RespondToApproval(ctx context.Context, threadID, requestID string, decision domain.ApprovalDecision) error {
	a.mu.Lock()
	sessionID, ok := a.pending[requestID]
	delete(a.pending, requestID)
	t := a.bySession[sessionID]
	if t == nil {
		t = a.threads[threadID]
	}
	a.mu.Unlock()
	if !ok || t == nil || t.api == nil {
		return errors.New("unknown approval request " + requestID)
	}

	response := "once"
	switch decision {
	case domain.ApprovalAllowAlways:
		response = "always"
	case domain.ApprovalDeny, domain.ApprovalCancel:
		response = "reject"
	}

	logger.Infof("OpenCode", "RespondToApproval: req=%s decision=%s session=%s", requestID, response, sessionID)

	path := "/session/" + sessionID + "/permissions/" + requestID
	if err := t.api.do(ctx, http.MethodPost, path, PermissionReply{Response: response}, nil); err != nil {
		return err
	}

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventApprovalResolved, ThreadID: threadID, Driver: domain.DriverOpenCode,
		Approval: &domain.ApprovalRequest{RequestID: requestID}, Text: response,
	})
	return nil
}

func (a *Adapter) RespondToQuestion(ctx context.Context, threadID, requestID string, answers []string) error {
	a.mu.Lock()
	sessionID, ok := a.pendingQuestions[requestID]
	if !ok {
		if t := a.threads[threadID]; t != nil {
			sessionID = t.sessionID
		}
	}
	delete(a.pendingQuestions, requestID)
	t := a.bySession[sessionID]
	if t == nil {
		t = a.threads[threadID]
	}
	a.mu.Unlock()

	if t == nil || t.api == nil {
		return errors.New("opencode api not initialized")
	}

	if len(answers) == 0 || (len(answers) == 1 && answers[0] == "skip") {
		logger.Infof("OpenCode", "Rejecting question %s for session %s", requestID, sessionID)
		_ = t.api.do(ctx, http.MethodPost, "/question/"+requestID+"/reject", map[string]any{}, nil)
	} else {
		logger.Infof("OpenCode", "Replying to question %s with %v for session %s", requestID, answers, sessionID)
		groups := make([][]string, 0, len(answers))
		for _, answer := range answers {
			groups = append(groups, []string{answer})
		}
		body := map[string]any{
			"answers": groups,
		}
		if err := t.api.do(ctx, http.MethodPost, "/question/"+requestID+"/reply", body, nil); err != nil {
			logger.Errorf("OpenCode", "question reply failed: %v", err)
			return err
		}
	}

	a.emit.Emit(domain.RuntimeEvent{
		Kind:     domain.EventQuestionAnswered,
		ThreadID: threadID,
		Driver:   domain.DriverOpenCode,
		Text:     strings.Join(answers, " / "),
	})
	return nil
}

func (a *Adapter) StopSession(ctx context.Context, threadID string) error {
	a.mu.Lock()
	t := a.threads[threadID]
	delete(a.threads, threadID)
	if t != nil {
		delete(a.bySession, t.sessionID)
	}
	a.mu.Unlock()
	if t == nil {
		return nil
	}
	if t.api != nil {
		_ = t.api.do(ctx, http.MethodPost, "/session/"+t.sessionID+"/abort", nil, nil)
	}
	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventSessionStopped, ThreadID: threadID, Driver: domain.DriverOpenCode,
	})
	return nil
}

func (a *Adapter) StopAll(ctx context.Context) error {
	a.mu.Lock()
	servers := a.servers
	a.servers = make(map[string]*serverEntry)
	a.threads = make(map[string]*thread)
	a.bySession = make(map[string]*thread)
	a.pending = make(map[string]string)
	a.pendingQuestions = make(map[string]string)
	a.mu.Unlock()

	for _, entry := range servers {
		if entry.streamed != nil {
			entry.streamed()
		}
		if entry.server != nil {
			entry.server.stop()
		}
	}
	return nil
}

func (a *Adapter) HasSession(threadID string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	_, ok := a.threads[threadID]
	return ok
}

func (a *Adapter) UpdateModel(threadID, model string, options domain.ModelOptions) bool {
	a.mu.RLock()
	t, ok := a.threads[threadID]
	a.mu.RUnlock()
	if !ok {
		return false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if model != "" {
		t.model = model
	}
	return true
}

// Session reports the thread's current session, including the OpenCode session
// id used to resume it in a later run.
func (a *Adapter) Session(threadID string) (domain.Session, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	t, ok := a.threads[threadID]
	if !ok {
		return domain.Session{}, false
	}
	return domain.Session{
		ThreadID:          threadID,
		Driver:            domain.DriverOpenCode,
		ProviderSessionID: t.sessionID,
	}, true
}

func parseModelRef(raw string) *ModelRef {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.SplitN(raw, "/", 2)
	if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
		return &ModelRef{ProviderID: parts[0], ModelID: parts[1]}
	}
	return &ModelRef{ProviderID: "opencode", ModelID: raw}
}

