package antigravity

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"catalyst/internal/domain"
	"catalyst/internal/process"
	"catalyst/internal/provider"
	"catalyst/internal/shell"
)

// Adapter drives Google's `agy` CLI. Unlike the streaming-stdin agents, agy is
// one-shot per prompt: each turn spawns a process and continuity comes from
// resuming the conversation id it reports.
type Adapter struct {
	settings domain.ProviderSettings
	emit     provider.Emitter

	mu       sync.RWMutex
	sessions map[string]*session
}

func NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) *Adapter {
	return &Adapter{settings: settings, emit: emit, sessions: make(map[string]*session)}
}

func (a *Adapter) Driver() domain.DriverKind { return domain.DriverAntigravity }

func (a *Adapter) Capabilities() provider.Capabilities {
	return provider.Capabilities{Resume: true, Plans: false}
}

type session struct {
	threadID   string
	cwd        string
	model      string
	options    domain.ModelOptions
	permission domain.PermissionMode

	mu             sync.Mutex
	conversationID string
	turnID         string
	cancelTurn     context.CancelFunc
	tools          map[int]string
	// proc is the process running the current turn. Unlike a session-scoped CLI
	// this adapter spawns one per prompt, so it is only set while a turn is in
	// flight — long enough for a dev server the turn starts to be attributed.
	proc *process.Process
}

func (a *Adapter) binary() string {
	if a.settings.BinaryPath != "" {
		return a.settings.BinaryPath
	}
	return "agy"
}

func (a *Adapter) StartSession(ctx context.Context, in domain.SessionStartInput) (domain.Session, error) {
	env := shell.Merge(shell.BaseEnvironment(), a.settings.Env)
	if _, ok := shell.LookPath(a.binary(), env); !ok {
		return domain.Session{}, fmt.Errorf("%w: %s", process.ErrNotFound, a.binary())
	}

	model := in.Model
	if model == "" {
		model = a.settings.Model
	}

	s := &session{
		threadID:       in.ThreadID,
		cwd:            in.Cwd,
		model:          model,
		options:        in.Options,
		permission:     in.Permission,
		conversationID: in.Resume,
		tools:          make(map[int]string),
	}

	a.mu.Lock()
	a.sessions[in.ThreadID] = s
	a.mu.Unlock()

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventSessionStarted, ThreadID: in.ThreadID,
		Driver: domain.DriverAntigravity, Text: in.Resume,
	})

	return domain.Session{
		ThreadID:          in.ThreadID,
		InstanceID:        in.InstanceID,
		Driver:            domain.DriverAntigravity,
		ProviderSessionID: in.Resume,
		Cwd:               in.Cwd,
		Model:             model,
		StartedAt:         time.Now().UnixMilli(),
	}, nil
}

func (a *Adapter) buildArgs(s *session, prompt string) []string {
	args := []string{"--print", prompt, "--output-format", "stream-json"}
	if s.model != "" {
		model, effort := SplitModelSelection(s.model, s.options)
		args = append(args, "--model", model)
		if effort != "" {
			args = append(args, "--effort", effort)
		}
	}

	// `--mode` only selects the edit workflow; tool approvals are gated
	// separately and default to request-review, which blocks in print mode.
	if s.permission == domain.PermissionBypass {
		args = append(args, "--dangerously-skip-permissions")
	} else if mode := permissionMode(s.permission); mode != "" {
		args = append(args, "--mode", mode)
	}

	s.mu.Lock()
	conversationID := s.conversationID
	s.mu.Unlock()
	if conversationID != "" {
		args = append(args, "--conversation", conversationID)
	}
	return append(args, shell.TokenizeArgs(a.settings.LaunchArgs)...)
}

// permissionMode maps canonical modes onto the two agy accepts; the default
// mode is left unset so the CLI keeps its own request-review behaviour.
func permissionMode(mode domain.PermissionMode) string {
	switch mode {
	case domain.PermissionAcceptEdits, domain.PermissionBypass:
		return "accept-edits"
	case domain.PermissionPlan:
		return "plan"
	default:
		return ""
	}
}

func (a *Adapter) SendTurn(ctx context.Context, in domain.SendTurnInput) error {
	s, ok := a.lookup(in.ThreadID)
	if !ok {
		return errors.New("no active session for thread " + in.ThreadID)
	}

	prompt := in.Text
	for _, file := range in.Files {
		prompt += "\n@" + file.Path
	}

	turnCtx, cancelTurn := context.WithCancel(context.Background())
	s.mu.Lock()
	if s.turnID != "" {
		s.mu.Unlock()
		cancelTurn()
		return errors.New("turn already in progress for thread " + in.ThreadID)
	}
	s.turnID = in.TurnID
	s.cancelTurn = cancelTurn
	s.tools = make(map[int]string)
	s.mu.Unlock()

	proc, err := process.Start(turnCtx, process.Spec{
		Command: a.binary(),
		Args:    a.buildArgs(s, prompt),
		Cwd:     s.cwd,
		Env:     shell.Merge(shell.BaseEnvironment(), a.settings.Env),
	})
	if err != nil {
		s.finishTurn()
		cancelTurn()
		return fmt.Errorf("start %s: %w", a.binary(), err)
	}

	s.mu.Lock()
	s.proc = proc
	s.mu.Unlock()

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnStarted, ThreadID: in.ThreadID, TurnID: in.TurnID,
		Driver: domain.DriverAntigravity,
	})

	go a.runTurn(turnCtx, s, in.TurnID, proc, cancelTurn)
	return nil
}

func (s *session) finishTurn() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	turnID := s.turnID
	s.turnID = ""
	s.cancelTurn = nil
	s.proc = nil
	return turnID
}

// Session reports the thread's current session. The conversation id accumulates
// across turns and is what resumes this thread in a later run.
func (a *Adapter) Session(threadID string) (domain.Session, bool) {
	a.mu.RLock()
	s, ok := a.sessions[threadID]
	a.mu.RUnlock()
	if !ok {
		return domain.Session{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return domain.Session{
		ThreadID:          threadID,
		Driver:            domain.DriverAntigravity,
		ProviderSessionID: s.conversationID,
		Cwd:               s.cwd,
		Model:             s.model,
	}, true
}

// SessionPID reports the process running the current turn, so servers it starts
// can be traced back to this agent.
//
// A turn-scoped process means attribution only holds while the agent is working.
// That still covers the case that matters: a dev server is started by a running
// turn, and once attributed the browser keeps the lane it was given.
func (a *Adapter) SessionPID(threadID string) (int, bool) {
	a.mu.RLock()
	s, ok := a.sessions[threadID]
	a.mu.RUnlock()
	if !ok {
		return 0, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.proc == nil {
		return 0, false
	}
	return s.proc.PID(), true
}

func (a *Adapter) runTurn(ctx context.Context, s *session, turnID string, proc *process.Process, cancel context.CancelFunc) {
	defer cancel()

	scanner := bufio.NewScanner(proc.Stdout())
	scanner.Buffer(make([]byte, 0, 128*1024), 32*1024*1024)

	completed := false
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var envelope Envelope
		if json.Unmarshal(line, &envelope) != nil {
			continue
		}
		if envelope.Event == "result" {
			// Release the turn slot before emitting the terminal event so a
			// caller reacting to it can immediately send the next turn.
			completed = true
			s.finishTurn()
		}
		a.handleEnvelope(s, turnID, &envelope)
	}

	<-proc.Done()
	s.finishTurn()

	if completed {
		return
	}

	// The process ended without a result frame: either cancelled by the user or
	// died. Report the distinction so the UI does not show a silent stall.
	if ctx.Err() != nil {
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventTurnCompleted, ThreadID: s.threadID, TurnID: turnID,
			Driver: domain.DriverAntigravity, StopReason: domain.StopCancelled,
		})
		return
	}
	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnFailed, ThreadID: s.threadID, TurnID: turnID,
		Driver: domain.DriverAntigravity, Error: a.binary() + " exited: " + proc.StderrTail(),
	})
}

func (a *Adapter) InterruptTurn(ctx context.Context, threadID string) error {
	s, ok := a.lookup(threadID)
	if !ok {
		return nil
	}
	s.mu.Lock()
	cancel := s.cancelTurn
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	return nil
}

// RespondToApproval is unused: agy resolves permissions through --mode rather
// than negotiating per tool call over the stream.
func (a *Adapter) RespondToApproval(context.Context, string, string, domain.ApprovalDecision) error {
	return errors.New("antigravity sessions resolve permissions via mode")
}

func (a *Adapter) StopSession(ctx context.Context, threadID string) error {
	a.mu.Lock()
	s, ok := a.sessions[threadID]
	delete(a.sessions, threadID)
	a.mu.Unlock()
	if !ok {
		return nil
	}

	s.mu.Lock()
	cancel := s.cancelTurn
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventSessionStopped, ThreadID: threadID, Driver: domain.DriverAntigravity,
	})
	return nil
}

func (a *Adapter) StopAll(ctx context.Context) error {
	a.mu.Lock()
	sessions := make([]*session, 0, len(a.sessions))
	for _, s := range a.sessions {
		sessions = append(sessions, s)
	}
	a.sessions = make(map[string]*session)
	a.mu.Unlock()

	for _, s := range sessions {
		s.mu.Lock()
		cancel := s.cancelTurn
		s.mu.Unlock()
		if cancel != nil {
			cancel()
		}
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventSessionStopped, ThreadID: s.threadID, Driver: domain.DriverAntigravity,
		})
	}
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
