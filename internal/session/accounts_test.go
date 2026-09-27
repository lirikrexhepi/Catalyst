package session

import (
	"context"
	"sync"
	"testing"

	"composer/internal/domain"
	"composer/internal/provider"
)

type accountFakeDriver struct {
	mu       sync.Mutex
	adapters []*accountFakeAdapter
}

func (d *accountFakeDriver) Kind() domain.DriverKind { return domain.DriverClaude }
func (d *accountFakeDriver) DisplayName() string     { return "Claude Code" }
func (d *accountFakeDriver) DefaultSettings() domain.ProviderSettings {
	return domain.ProviderSettings{Enabled: true}
}
func (d *accountFakeDriver) Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot {
	return domain.ProviderSnapshot{Availability: domain.AvailabilityReady}
}
func (d *accountFakeDriver) NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) (provider.Adapter, error) {
	adapter := &accountFakeAdapter{configDir: settings.Env["FAKE_CONFIG_DIR"], sessions: map[string]domain.SessionStartInput{}}
	d.mu.Lock()
	d.adapters = append(d.adapters, adapter)
	d.mu.Unlock()
	return adapter, nil
}
func (d *accountFakeDriver) Binary(settings domain.ProviderSettings) string { return "fake" }
func (d *accountFakeDriver) AccountEnv(dir string) map[string]string {
	return map[string]string{"FAKE_CONFIG_DIR": dir}
}
func (d *accountFakeDriver) AccountUnset() []string                        { return []string{"FAKE_CONFIG_DIR"} }
func (d *accountFakeDriver) DefaultConfigDir(env map[string]string) string { return "" }
func (d *accountFakeDriver) SharedSettings() []string                      { return nil }
func (d *accountFakeDriver) SignInArgs() []string                          { return nil }
func (d *accountFakeDriver) StatusArgs() []string                          { return nil }
func (d *accountFakeDriver) ParseStatus(result provider.CommandResult) provider.AccountStatus {
	return provider.AccountStatus{}
}

func (d *accountFakeDriver) adapterCount() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.adapters)
}

type accountFakeAdapter struct {
	configDir string

	mu       sync.Mutex
	sessions map[string]domain.SessionStartInput
}

func (a *accountFakeAdapter) Driver() domain.DriverKind           { return domain.DriverClaude }
func (a *accountFakeAdapter) Capabilities() provider.Capabilities { return provider.Capabilities{} }
func (a *accountFakeAdapter) StartSession(ctx context.Context, in domain.SessionStartInput) (domain.Session, error) {
	a.mu.Lock()
	a.sessions[in.ThreadID] = in
	a.mu.Unlock()
	return domain.Session{ThreadID: in.ThreadID, Driver: domain.DriverClaude, Cwd: in.Cwd, Model: in.Model}, nil
}
func (a *accountFakeAdapter) SendTurn(ctx context.Context, in domain.SendTurnInput) error { return nil }
func (a *accountFakeAdapter) InterruptTurn(ctx context.Context, threadID string) error    { return nil }
func (a *accountFakeAdapter) RespondToApproval(ctx context.Context, threadID, requestID string, decision domain.ApprovalDecision) error {
	return nil
}
func (a *accountFakeAdapter) RespondToQuestion(ctx context.Context, threadID, requestID string, answers []string) error {
	return nil
}
func (a *accountFakeAdapter) StopSession(ctx context.Context, threadID string) error {
	a.mu.Lock()
	delete(a.sessions, threadID)
	a.mu.Unlock()
	return nil
}
func (a *accountFakeAdapter) StopAll(ctx context.Context) error { return nil }
func (a *accountFakeAdapter) HasSession(threadID string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	_, ok := a.sessions[threadID]
	return ok
}

type accountFixture struct {
	driver   *accountFakeDriver
	registry *provider.Registry
	manager  *Manager
	personal domain.Account
	project  string
	defaults map[string]string
}

func newAccountFixture(t *testing.T) *accountFixture {
	t.Helper()
	driver := &accountFakeDriver{}
	registry := provider.NewRegistry(driver)
	registry.UseAccounts(provider.NewAccounts(t.TempDir()))
	personal, err := registry.AccountStore().Add(domain.DriverClaude, "Personal")
	if err != nil {
		t.Fatal(err)
	}
	f := &accountFixture{
		driver:   driver,
		registry: registry,
		manager:  NewManager(registry),
		personal: personal,
		project:  t.TempDir(),
		defaults: map[string]string{},
	}
	f.manager.SetAccountResolver(func(kind domain.DriverKind, cwd string) string {
		if cwd == f.project {
			return f.defaults[string(kind)]
		}
		return ""
	})
	return f
}

func (f *accountFixture) sessionAccount(t *testing.T, threadID string) string {
	t.Helper()
	live, ok := f.manager.ThreadSession(threadID)
	if !ok {
		t.Fatalf("thread %s is not live", threadID)
	}
	return live.Account
}

func (f *accountFixture) configDirOf(t *testing.T, threadID string) string {
	t.Helper()
	f.manager.mu.RLock()
	entry, ok := f.manager.threads[threadID]
	f.manager.mu.RUnlock()
	if !ok {
		t.Fatalf("thread %s is not registered", threadID)
	}
	return entry.adapter.(*accountFakeAdapter).configDir
}

func TestSessionsUseTheDefaultAccountUnlessTheProjectSaysOtherwise(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()

	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "a", Cwd: f.project}); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, "a"); got != domain.DefaultAccountID {
		t.Fatalf("account = %q, want default", got)
	}
	if dir := f.configDirOf(t, "a"); dir != "" {
		t.Fatalf("default account must not get a config dir, got %q", dir)
	}

	f.defaults["claude"] = f.personal.ID
	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "b", Cwd: f.project}); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, "b"); got != f.personal.ID {
		t.Fatalf("project default was not inherited: %q", got)
	}
	if dir := f.configDirOf(t, "b"); dir != f.personal.ConfigDir {
		t.Fatalf("config dir = %q, want %q", dir, f.personal.ConfigDir)
	}

	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "c", Cwd: f.project, Account: domain.DefaultAccountID}); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, "c"); got != domain.DefaultAccountID {
		t.Fatalf("a chat's own choice must beat the project default, got %q", got)
	}

	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "d", Cwd: t.TempDir()}); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, "d"); got != domain.DefaultAccountID {
		t.Fatalf("other folders keep the default account, got %q", got)
	}
}

func TestAccountsGetTheirOwnAdaptersAndRunConcurrently(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	for _, start := range []domain.SessionStartInput{
		{ThreadID: "w1", Cwd: f.project},
		{ThreadID: "p1", Cwd: f.project, Account: f.personal.ID},
		{ThreadID: "w2", Cwd: f.project},
		{ThreadID: "p2", Cwd: f.project, Account: f.personal.ID},
	} {
		if _, err := f.manager.Start(ctx, domain.DriverClaude, start); err != nil {
			t.Fatal(err)
		}
	}
	if n := f.driver.adapterCount(); n != 2 {
		t.Fatalf("expected one adapter per account, got %d", n)
	}
	if f.configDirOf(t, "p1") != f.personal.ConfigDir || f.configDirOf(t, "p2") != f.personal.ConfigDir {
		t.Fatal("personal chats must share the personal account's adapter")
	}
	if f.configDirOf(t, "w1") != "" || f.configDirOf(t, "w2") != "" {
		t.Fatal("default chats must not see the personal config dir")
	}
}

func TestRemovedAccountIsNotSilentlySwapped(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	if err := f.registry.AccountStore().Remove(domain.DriverClaude, f.personal.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "x", Account: f.personal.ID}); err == nil {
		t.Fatal("resuming on a removed account must fail rather than use another account's history")
	}
	f.defaults["claude"] = f.personal.ID
	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "y", Cwd: f.project}); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, "y"); got != domain.DefaultAccountID {
		t.Fatalf("a stale project default should fall back to the default account, got %q", got)
	}
}

func TestReviveKeepsTheAccount(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	if _, err := f.manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{ThreadID: "r", Cwd: f.project, Account: f.personal.ID}); err != nil {
		t.Fatal(err)
	}
	f.manager.mu.RLock()
	adapter := f.manager.threads["r"].adapter
	f.manager.mu.RUnlock()
	_ = adapter.StopSession(ctx, "r")

	if err := f.manager.Send(ctx, domain.SendTurnInput{ThreadID: "r", TurnID: "t", Text: "hi"}); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, "r"); got != f.personal.ID {
		t.Fatalf("revived session changed account to %q", got)
	}
}

func TestSpawnedAgentsInheritAndRecordTheirAccount(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	workspaces := NewWorkspaces()
	spawner := NewSpawner(f.manager, workspaces)
	f.defaults["claude"] = f.personal.ID

	result, err := spawner.Spawn(ctx, []SpawnRequest{
		{Title: "inherits", Prompt: "go"},
		{Title: "overridden", Prompt: "go", Account: domain.DefaultAccountID},
	}, SpawnOptions{Driver: domain.DriverClaude, Cwd: f.project})
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	if len(result.Tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(result.Tasks))
	}
	if got := result.Tasks[0].Account; got != f.personal.ID {
		t.Fatalf("spawned agent should inherit the project's account, got %q", got)
	}
	if got := f.sessionAccount(t, result.Tasks[0].ThreadID); got != f.personal.ID {
		t.Fatalf("live session account = %q", got)
	}
	if got := result.Tasks[1].Account; got != domain.DefaultAccountID {
		t.Fatalf("explicit per-task account should win, got %q", got)
	}

	chosen, err := spawner.Spawn(ctx, []SpawnRequest{{Title: "plan-wide", Prompt: "go"}},
		SpawnOptions{Driver: domain.DriverClaude, Cwd: f.project, Account: domain.DefaultAccountID})
	if err != nil {
		t.Fatal(err)
	}
	if got := chosen.Tasks[0].Account; got != domain.DefaultAccountID {
		t.Fatalf("plan-wide account should apply, got %q", got)
	}
}

func TestResumeUsesTheAccountTheChatStartedWith(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	spawner := NewSpawner(f.manager, NewWorkspaces())
	f.defaults["claude"] = f.personal.ID

	result := spawner.Resume(ctx, []ResumeRequest{
		{ThreadID: "legacy", Driver: domain.DriverClaude, Cwd: f.project, ProviderSessionID: "old"},
		{ThreadID: "work", Driver: domain.DriverClaude, Cwd: f.project, Account: domain.DefaultAccountID, ProviderSessionID: "s1"},
		{ThreadID: "mine", Driver: domain.DriverClaude, Cwd: f.project, Account: f.personal.ID, ProviderSessionID: "s2"},
	})
	for _, outcome := range result.Outcomes {
		if !outcome.Live {
			t.Fatalf("resume failed: %+v", outcome)
		}
	}
	if got := f.sessionAccount(t, "legacy"); got != domain.DefaultAccountID {
		t.Fatalf("chats recorded before accounts existed ran on the default account, got %q", got)
	}
	if got := f.sessionAccount(t, "work"); got != domain.DefaultAccountID {
		t.Fatalf("work chat resumed on %q", got)
	}
	if got := f.sessionAccount(t, "mine"); got != f.personal.ID {
		t.Fatalf("personal chat resumed on %q", got)
	}
	if dir := f.configDirOf(t, "mine"); dir != f.personal.ConfigDir {
		t.Fatalf("personal chat resumed with config dir %q", dir)
	}
}

func TestCoordinatorRestartsWhenItsAccountChanges(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	coordinator := NewCoordinator(f.manager)

	if _, err := coordinator.Send(ctx, Config{Driver: "claude", Cwd: f.project}, "hi"); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, CoordinatorThreadID); got != domain.DefaultAccountID {
		t.Fatalf("coordinator account = %q", got)
	}
	if _, err := coordinator.Send(ctx, Config{Driver: "claude", Cwd: f.project, Account: f.personal.ID}, "again"); err != nil {
		t.Fatal(err)
	}
	if got := f.sessionAccount(t, CoordinatorThreadID); got != f.personal.ID {
		t.Fatalf("coordinator did not switch account, got %q", got)
	}
	cfg, _ := coordinator.CurrentConfig()
	if cfg.Account != f.personal.ID {
		t.Fatalf("current config account = %q", cfg.Account)
	}
}

func TestUsageAndLimitsAreKeptPerAccount(t *testing.T) {
	tracker := NewUsageTracker()
	used := 100
	tracker.Observe(domain.RuntimeEvent{Kind: domain.EventSessionStarted, ThreadID: "p", Driver: domain.DriverClaude, Account: "personal"})
	tracker.Observe(domain.RuntimeEvent{Kind: domain.EventRateLimit, ThreadID: "p", Driver: domain.DriverClaude, Account: "personal",
		RateLimits: []domain.RateLimit{{Window: "five_hour", Status: "rejected", UsedPercent: &used}}})
	tracker.Observe(domain.RuntimeEvent{Kind: domain.EventUsage, ThreadID: "p", TurnID: "t", Usage: &domain.Usage{InputTokens: 10}})
	low := 5
	tracker.SetLimits(domain.DriverClaude, []domain.RateLimit{{Window: "five_hour", Status: "allowed", UsedPercent: &low}}, 1)

	report := tracker.Report()
	var work, personal *DriverUsage
	for i := range report.Drivers {
		switch report.Drivers[i].Account {
		case domain.DefaultAccountID:
			work = &report.Drivers[i]
		case "personal":
			personal = &report.Drivers[i]
		}
	}
	if work == nil || personal == nil {
		t.Fatalf("expected separate rows per account, got %+v", report.Drivers)
	}
	if personal.Limits[0].Status != "rejected" || work.Limits[0].Status != "allowed" {
		t.Fatalf("one account's limit leaked into the other: work=%+v personal=%+v", work.Limits, personal.Limits)
	}
	if personal.InputTokens != 10 || work.InputTokens != 0 {
		t.Fatalf("usage was attributed to the wrong account: work=%d personal=%d", work.InputTokens, personal.InputTokens)
	}
}
