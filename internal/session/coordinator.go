package session

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"
	"sync/atomic"

	"catalyst/internal/domain"
)

// CoordinatorThreadID is the live orchestrator conversation.
//
// History binds a *copy* of this conversation to each workspace instead of
// giving every workspace its own live thread: the input bar is one continuous
// chat, and rebinding it per spawn would reset the user's context every time
// they delegated. See Coordinator.BindWorkspace.
const CoordinatorThreadID = "coordinator"

// CoordinatorThreadFor names the orchestrator transcript stored against a
// workspace. Reopening a session replays this alongside its agents, which is
// what makes a Catalyst session more than a single agent's chat log.
func CoordinatorThreadFor(workspaceID string) string {
	if workspaceID == "" {
		return CoordinatorThreadID
	}
	return CoordinatorThreadID + "-" + workspaceID
}

// Coordinator owns the single top-level conversation driven by the main input
// bar. Switching provider, model, or options restarts the underlying CLI
// session transparently, so the caller only ever sends messages.
type Coordinator struct {
	manager *Manager

	mu      sync.Mutex
	driver  domain.DriverKind
	model   string
	options domain.ModelOptions
	cwd     string
	started bool
	primed  bool
	// pending holds the turns of the current conversation that have not yet been
	// attributed to a workspace. A spawn claims them, which is how the plan that
	// produced a set of agents ends up stored beside those agents.
	pending []domain.RuntimeEvent

	turnSeq atomic.Uint64
	sink    CoordinatorSink
}

// CoordinatorSink receives the orchestrator transcript once a spawn gives it a
// workspace to belong to.
type CoordinatorSink interface {
	RecordCoordinator(workspaceID, threadID string, events []domain.RuntimeEvent)
}

func NewCoordinator(manager *Manager) *Coordinator {
	return &Coordinator{manager: manager}
}

// SetSink attaches durable storage for orchestrator transcripts.
func (c *Coordinator) SetSink(sink CoordinatorSink) {
	c.mu.Lock()
	c.sink = sink
	c.mu.Unlock()
}

// BindWorkspace hands the conversation so far to a newly created workspace and
// starts a fresh one.
//
// Called at spawn time: everything the user and orchestrator said to reach this
// plan is stored under the workspace the plan created, then cleared so the next
// delegation records its own discussion rather than repeating this one.
func (c *Coordinator) BindWorkspace(workspaceID string) string {
	threadID := CoordinatorThreadFor(workspaceID)

	c.mu.Lock()
	sink := c.sink
	events := c.pending
	c.pending = nil
	c.mu.Unlock()

	if sink == nil {
		return threadID
	}

	// Re-stamped onto the workspace's own thread id so a replay groups them
	// with that session rather than with the live coordinator.
	stored := make([]domain.RuntimeEvent, 0, len(events))
	for _, event := range events {
		event.ThreadID = threadID
		stored = append(stored, event)
	}
	sink.RecordCoordinator(workspaceID, threadID, stored)
	return threadID
}

// Config is the frontend-facing selection for the coordinator thread.
type Config struct {
	Driver     string                `json:"driver"`
	Model      string                `json:"model,omitempty"`
	Options    domain.ModelOptions   `json:"options,omitempty"`
	Cwd        string                `json:"cwd,omitempty"`
	Permission domain.PermissionMode `json:"permissionMode,omitempty"`
}

// Send ensures a session matching cfg is live, then delivers the message. The
// returned turn id lets the caller correlate streamed events.
func (c *Coordinator) Send(ctx context.Context, cfg Config, text string) (string, error) {
	if text == "" {
		return "", fmt.Errorf("message is empty")
	}
	if err := c.ensureSession(ctx, cfg); err != nil {
		return "", err
	}

	turnID := "turn-" + strconv.FormatUint(c.turnSeq.Add(1), 10)

	// The planning instructions ride on the first message of a session: the
	// CLIs differ in whether they accept a system prompt flag, and a restart
	// (model switch) must re-establish the role.
	c.mu.Lock()
	body := text
	if !c.primed {
		body = SystemPrompt + "\n\n---\n\n" + text
		c.primed = true
	}
	c.mu.Unlock()

	if err := c.manager.Send(ctx, domain.SendTurnInput{
		ThreadID: CoordinatorThreadID,
		TurnID:   turnID,
		Text:     body,
	}); err != nil {
		return "", err
	}
	return turnID, nil
}

func (c *Coordinator) ensureSession(ctx context.Context, cfg Config) error {
	driver := domain.DriverKind(cfg.Driver)
	cwd := cfg.Cwd
	if cwd == "" {
		if wd, err := os.Getwd(); err == nil {
			cwd = wd
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.started && c.matches(driver, cfg, cwd) {
		return nil
	}
	if c.started {
		_ = c.manager.Stop(ctx, CoordinatorThreadID)
		c.started = false
	}

	if _, err := c.manager.Start(ctx, driver, domain.SessionStartInput{
		ThreadID:   CoordinatorThreadID,
		Cwd:        cwd,
		Model:      cfg.Model,
		Options:    cfg.Options,
		Permission: cfg.Permission,
		PlanOnly:   true,
	}); err != nil {
		return err
	}

	c.driver, c.model, c.options, c.cwd, c.started = driver, cfg.Model, cfg.Options, cwd, true
	c.primed = false
	return nil
}

func (c *Coordinator) matches(driver domain.DriverKind, cfg Config, cwd string) bool {
	return c.driver == driver && c.model == cfg.Model && c.cwd == cwd &&
		sameOptions(c.options, cfg.Options)
}

func sameOptions(a, b domain.ModelOptions) bool {
	if len(a) != len(b) {
		return false
	}
	for key, valueA := range a {
		valueB, ok := b[key]
		if !ok || fmt.Sprint(valueA) != fmt.Sprint(valueB) {
			return false
		}
	}
	return true
}

func (c *Coordinator) Interrupt(ctx context.Context) error {
	return c.manager.Interrupt(ctx, CoordinatorThreadID)
}

func (c *Coordinator) Reset(ctx context.Context) error {
	c.mu.Lock()
	c.started, c.primed = false, false
	// The unattributed transcript belongs to the conversation being discarded;
	// carrying it forward would file it under whatever the next request spawns.
	c.pending = nil
	c.mu.Unlock()
	return c.manager.Stop(ctx, CoordinatorThreadID)
}

func (c *Coordinator) History() []domain.RuntimeEvent {
	return c.manager.History(CoordinatorThreadID)
}

// Observe collects an orchestrator event for the workspace a later spawn will
// create. Cheap and lock-scoped: it runs for every streamed token.
func (c *Coordinator) Observe(event domain.RuntimeEvent) {
	if event.ThreadID != CoordinatorThreadID {
		return
	}

	c.mu.Lock()
	// A conversation that never delegates would otherwise grow without bound.
	// The cap is generous; only the tail matters for reconstructing a plan.
	if len(c.pending) < coordinatorPendingLimit {
		c.pending = append(c.pending, event)
	}
	c.mu.Unlock()
}

// coordinatorPendingLimit bounds the unattributed transcript held in memory
// between spawns.
const coordinatorPendingLimit = 4000
