package claude

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"catalyst/internal/domain"
	"catalyst/internal/process"
	"catalyst/internal/provider"
	"catalyst/internal/shell"
)

const defaultBinary = "claude"

type Adapter struct {
	settings domain.ProviderSettings
	emit     provider.Emitter

	mu       sync.RWMutex
	sessions map[string]*session
}

func NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) *Adapter {
	return &Adapter{settings: settings, emit: emit, sessions: make(map[string]*session)}
}

func (a *Adapter) Driver() domain.DriverKind { return domain.DriverClaude }

func (a *Adapter) Capabilities() provider.Capabilities {
	return provider.Capabilities{Resume: true, Plans: true}
}

type session struct {
	threadID string
	proc     *process.Process
	cancel   context.CancelFunc
	encoder  *json.Encoder

	mu        sync.Mutex
	writeMu   sync.Mutex
	turnID    string
	sessionID string
}

func (s *session) providerSessionID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessionID
}

func (a *Adapter) binary() string {
	if a.settings.BinaryPath != "" {
		return a.settings.BinaryPath
	}
	return defaultBinary
}

func (a *Adapter) buildArgs(in domain.SessionStartInput) []string {
	args := []string{
		"--print",
		"--input-format", "stream-json",
		"--output-format", "stream-json",
		"--verbose",
	}

	if model := firstNonEmpty(in.Model, a.settings.Model); model != "" {
		args = append(args, "--model", ResolveModelID(model, in.Options))
	}
	if effort := in.Options.String(domain.OptionEffort); effort != "" {
		args = append(args, "--effort", effort)
	}
	if in.Permission != "" {
		args = append(args, "--permission-mode", string(in.Permission))
	}
	// An empty tool list denies every tool, which keeps a planning session from
	// exploring the repository instead of answering.
	if in.PlanOnly {
		args = append(args, "--tools", "")
	}
	if in.Resume != "" {
		args = append(args, "--resume", in.Resume)
	}

	// `thinking` and `fastMode` are Claude Code settings rather than flags, so
	// they ride along as a --settings JSON blob.
	if settings := sessionSettings(in.Options); settings != "" {
		args = append(args, "--settings", settings)
	}
	return append(args, shell.TokenizeArgs(a.settings.LaunchArgs)...)
}

func sessionSettings(options domain.ModelOptions) string {
	fields := map[string]any{}
	if _, ok := options[domain.OptionThinking]; ok {
		fields["alwaysThinkingEnabled"] = options.Bool(domain.OptionThinking)
	}
	if options.Bool(domain.OptionFastMode) {
		fields["fastMode"] = true
	}
	if len(fields) == 0 {
		return ""
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		return ""
	}
	return string(encoded)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func (a *Adapter) StartSession(ctx context.Context, in domain.SessionStartInput) (domain.Session, error) {
	env := shell.Merge(shell.BaseEnvironment(), a.settings.Env)
	procCtx, cancel := context.WithCancel(context.Background())

	proc, err := process.Start(procCtx, process.Spec{
		Command: a.binary(),
		Args:    a.buildArgs(in),
		Cwd:     in.Cwd,
		Env:     env,
	})
	if err != nil {
		cancel()
		return domain.Session{}, fmt.Errorf("start %s: %w", a.binary(), err)
	}

	s := &session{
		threadID: in.ThreadID,
		proc:     proc,
		cancel:   cancel,
		encoder:  json.NewEncoder(proc.Stdin()),
	}

	a.mu.Lock()
	a.sessions[in.ThreadID] = s
	a.mu.Unlock()

	go a.readLoop(s)

	// These CLIs stay silent until the first user message, so the session id
	// only appears in the init frame after SendTurn. Starting is therefore
	// non-blocking; SessionID is filled in later and surfaced via the
	// session.started event.
	return domain.Session{
		ThreadID:          in.ThreadID,
		InstanceID:        in.InstanceID,
		Driver:            domain.DriverClaude,
		ProviderSessionID: s.providerSessionID(),
		Cwd:               in.Cwd,
		Model:             in.Model,
		StartedAt:         time.Now().UnixMilli(),
	}, nil
}

func (a *Adapter) readLoop(s *session) {
	scanner := bufio.NewScanner(s.proc.Stdout())
	scanner.Buffer(make([]byte, 0, 128*1024), 32*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var envelope Envelope
		if err := json.Unmarshal(line, &envelope); err != nil {
			continue
		}
		a.handleEnvelope(s, &envelope)
	}

	a.finish(s, scanner.Err())
}

func (a *Adapter) finish(s *session, err error) {
	<-s.proc.Done()

	a.mu.Lock()
	delete(a.sessions, s.threadID)
	a.mu.Unlock()

	s.mu.Lock()
	turnID := s.turnID
	s.turnID = ""
	s.mu.Unlock()

	if turnID != "" {
		detail := s.proc.StderrTail()
		if detail == "" && err != nil && !errors.Is(err, io.EOF) {
			detail = err.Error()
		}
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventTurnFailed, ThreadID: s.threadID, TurnID: turnID,
			Driver: domain.DriverClaude, Error: a.binary() + " exited: " + detail,
		})
	}

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventSessionStopped, ThreadID: s.threadID, Driver: domain.DriverClaude,
	})
	s.cancel()
}

func (a *Adapter) SendTurn(ctx context.Context, in domain.SendTurnInput) error {
	s, ok := a.lookup(in.ThreadID)
	if !ok {
		return errors.New("no active session for thread " + in.ThreadID)
	}

	s.mu.Lock()
	s.turnID = in.TurnID
	s.mu.Unlock()

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnStarted, ThreadID: in.ThreadID, TurnID: in.TurnID, Driver: domain.DriverClaude,
	})

	text := in.Text
	for _, file := range in.Files {
		text += "\n@" + file.Path
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.encoder.Encode(UserText(text)); err != nil {
		return fmt.Errorf("write turn: %w", err)
	}
	return nil
}

// InterruptTurn stops the child. The CLI has no in-band cancel on the stdin
// stream, so the session is torn down and the caller resumes by session id.
func (a *Adapter) InterruptTurn(ctx context.Context, threadID string) error {
	s, ok := a.lookup(threadID)
	if !ok {
		return nil
	}
	s.mu.Lock()
	turnID := s.turnID
	s.turnID = ""
	s.mu.Unlock()

	if turnID != "" {
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventTurnCompleted, ThreadID: threadID, TurnID: turnID,
			Driver: domain.DriverClaude, StopReason: domain.StopCancelled,
		})
	}
	s.cancel()
	return s.proc.Shutdown(time.Second)
}

// RespondToApproval is unused: these CLIs resolve permissions through the
// session-level mode flag rather than negotiating per tool call.
func (a *Adapter) RespondToApproval(context.Context, string, string, domain.ApprovalDecision) error {
	return errors.New("stream-json sessions resolve permissions via permission mode")
}

func (a *Adapter) StopSession(ctx context.Context, threadID string) error {
	a.mu.Lock()
	s, ok := a.sessions[threadID]
	delete(a.sessions, threadID)
	a.mu.Unlock()
	if !ok {
		return nil
	}
	s.cancel()
	return s.proc.Shutdown(2 * time.Second)
}

func (a *Adapter) StopAll(ctx context.Context) error {
	a.mu.Lock()
	sessions := make([]*session, 0, len(a.sessions))
	for _, s := range a.sessions {
		sessions = append(sessions, s)
	}
	a.sessions = make(map[string]*session)
	a.mu.Unlock()

	var wg sync.WaitGroup
	for _, s := range sessions {
		wg.Add(1)
		go func(s *session) {
			defer wg.Done()
			s.cancel()
			_ = s.proc.Shutdown(2 * time.Second)
		}(s)
	}
	wg.Wait()
	return nil
}

func (a *Adapter) HasSession(threadID string) bool {
	_, ok := a.lookup(threadID)
	return ok
}

func (a *Adapter) lookup(threadID string) (*session, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	s, ok := a.sessions[threadID]
	return s, ok
}
