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

const CoordinatorThreadID = "coordinator"

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

	turnSeq atomic.Uint64
}

func NewCoordinator(manager *Manager) *Coordinator {
	return &Coordinator{manager: manager}
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
	defer c.mu.Unlock()
	c.started, c.primed = false, false
	return c.manager.Stop(ctx, CoordinatorThreadID)
}

func (c *Coordinator) History() []domain.RuntimeEvent {
	return c.manager.History(CoordinatorThreadID)
}
