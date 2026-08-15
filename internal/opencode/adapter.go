package opencode

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"catalyst/internal/domain"
	"catalyst/internal/provider"
)

// Adapter talks to a managed (or external) OpenCode HTTP server. One server
// serves every thread; sessions are server-side resources keyed by id.
type Adapter struct {
	settings domain.ProviderSettings
	emit     provider.Emitter
	client   *http.Client

	starting sync.Mutex
	mu       sync.RWMutex
	server   *server
	api      *httpClient
	streamed context.CancelFunc

	threads   map[string]*thread
	bySession map[string]*thread
	pending   map[string]string
}

type thread struct {
	threadID  string
	sessionID string
	model     string

	mu     sync.Mutex
	turnID string
	tools  map[string]string
}

func NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) *Adapter {
	return &Adapter{
		settings:  settings,
		emit:      emit,
		client:    &http.Client{Timeout: 0},
		threads:   make(map[string]*thread),
		bySession: make(map[string]*thread),
		pending:   make(map[string]string),
	}
}

func (a *Adapter) Driver() domain.DriverKind { return domain.DriverOpenCode }

func (a *Adapter) Capabilities() provider.Capabilities {
	return provider.Capabilities{SessionModelSwitch: true, Resume: true, Approvals: true}
}

func (a *Adapter) ensureServer(ctx context.Context) (*httpClient, error) {
	a.mu.RLock()
	api := a.api
	a.mu.RUnlock()
	if api != nil {
		return api, nil
	}

	a.starting.Lock()
	defer a.starting.Unlock()

	a.mu.RLock()
	api = a.api
	a.mu.RUnlock()
	if api != nil {
		return api, nil
	}

	srv, err := startServer(ctx, a.settings, a.client)
	if err != nil {
		return nil, err
	}

	api = &httpClient{base: srv.baseURL, client: a.client}
	streamCtx, cancel := context.WithCancel(context.Background())

	a.mu.Lock()
	a.server, a.api, a.streamed = srv, api, cancel
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
	api, err := a.ensureServer(ctx)
	if err != nil {
		return domain.Session{}, err
	}

	model := in.Model
	if model == "" {
		model = a.settings.Model
	}

	t := &thread{threadID: in.ThreadID, model: model, tools: make(map[string]string)}

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
	api := a.api
	a.mu.RUnlock()
	if t == nil || api == nil {
		return errors.New("no active session for thread " + in.ThreadID)
	}

	parts := make([]any, 0, len(in.Files)+1)
	if in.Text != "" {
		parts = append(parts, TextPart{Type: "text", Text: in.Text})
	}
	for _, file := range in.Files {
		parts = append(parts, FilePart{Type: "file", MIME: file.MIME, URL: "file://" + file.Path})
	}

	t.mu.Lock()
	t.turnID = in.TurnID
	t.mu.Unlock()

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnStarted, ThreadID: in.ThreadID, TurnID: in.TurnID, Driver: domain.DriverOpenCode,
	})

	request := PromptRequest{Model: t.model, Parts: parts}
	if err := api.do(ctx, http.MethodPost, "/session/"+t.sessionID+"/prompt_async", request, nil); err != nil {
		t.mu.Lock()
		t.turnID = ""
		t.mu.Unlock()
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventTurnFailed, ThreadID: in.ThreadID, TurnID: in.TurnID,
			Driver: domain.DriverOpenCode, Error: err.Error(),
		})
		return err
	}
	return nil
}

func (a *Adapter) InterruptTurn(ctx context.Context, threadID string) error {
	a.mu.RLock()
	t := a.threads[threadID]
	api := a.api
	a.mu.RUnlock()
	if t == nil || api == nil {
		return nil
	}
	return api.do(ctx, http.MethodPost, "/session/"+t.sessionID+"/abort", nil, nil)
}

func (a *Adapter) RespondToApproval(ctx context.Context, threadID, requestID string, decision domain.ApprovalDecision) error {
	a.mu.Lock()
	sessionID, ok := a.pending[requestID]
	delete(a.pending, requestID)
	api := a.api
	a.mu.Unlock()
	if !ok || api == nil {
		return errors.New("unknown approval request " + requestID)
	}

	response := "once"
	switch decision {
	case domain.ApprovalAllowAlways:
		response = "always"
	case domain.ApprovalDeny, domain.ApprovalCancel:
		response = "reject"
	}

	path := "/session/" + sessionID + "/permissions/" + requestID
	if err := api.do(ctx, http.MethodPost, path, PermissionReply{Response: response}, nil); err != nil {
		return err
	}

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventApprovalResolved, ThreadID: threadID, Driver: domain.DriverOpenCode,
		Approval: &domain.ApprovalRequest{RequestID: requestID}, Text: response,
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
	api := a.api
	a.mu.Unlock()
	if t == nil {
		return nil
	}
	if api != nil {
		_ = api.do(ctx, http.MethodPost, "/session/"+t.sessionID+"/abort", nil, nil)
	}
	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventSessionStopped, ThreadID: threadID, Driver: domain.DriverOpenCode,
	})
	return nil
}

func (a *Adapter) StopAll(ctx context.Context) error {
	a.mu.Lock()
	srv, cancel := a.server, a.streamed
	a.threads = make(map[string]*thread)
	a.bySession = make(map[string]*thread)
	a.pending = make(map[string]string)
	a.server, a.api, a.streamed = nil, nil, nil
	a.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if srv != nil {
		srv.stop()
	}
	return nil
}

func (a *Adapter) HasSession(threadID string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	_, ok := a.threads[threadID]
	return ok
}
