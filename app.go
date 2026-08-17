package main

import (
	"context"
	"fmt"
	"os"

	"path/filepath"

	"catalyst/internal/claude"
	"catalyst/internal/domain"
	"catalyst/internal/drivers"
	"catalyst/internal/git"
	"catalyst/internal/history"
	"catalyst/internal/provider"
	"catalyst/internal/servers"
	"catalyst/internal/session"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const runtimeEventChannel = "agent:event"

type App struct {
	ctx         context.Context
	registry    *provider.Registry
	manager     *session.Manager
	coordinator *session.Coordinator
	workspaces  *session.Workspaces
	spawner     *session.Spawner
	usage       *session.UsageTracker
	scanner     *servers.Scanner
	historyStore *history.Store
	recorder    *history.Recorder
	stopFeed    func()
}

func NewApp() *App {
	registry := provider.NewRegistry(drivers.All()...)
	// Applied before anything probes, so a preferred model saved in an earlier
	// run is already in effect for the first CLI detection.
	registry.UsePrefs(provider.NewPrefs(configRoot()))
	manager := session.NewManager(registry)
	workspaces := session.NewWorkspaces()
	coordinator := session.NewCoordinator(manager)
	spawner := session.NewSpawner(manager, workspaces)

	store := history.New(historyRoot())
	recorder := history.NewRecorder(store)

	// Persistence is attached rather than built in, so the session layer stays
	// testable without a filesystem.
	manager.SetRecorder(recorder)
	coordinator.SetSink(recorder)
	spawner.SetTracker(history.NewTracker(recorder, coordinator))

	return &App{
		registry:     registry,
		manager:      manager,
		coordinator:  coordinator,
		workspaces:   workspaces,
		spawner:      spawner,
		usage:        session.NewUsageTracker(),
		scanner:      servers.NewScanner(),
		historyStore: store,
		recorder:     recorder,
	}
}

// configRoot is where Catalyst keeps everything it remembers between runs,
// falling back to the working directory when the user config dir is unavailable.
func configRoot() string {
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, "catalyst")
	}
	return ".catalyst"
}

// historyRoot resolves where sessions are stored.
func historyRoot() string {
	return filepath.Join(configRoot(), "history")
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	events, cancel := a.manager.Bus().Subscribe()
	a.stopFeed = cancel

	go func() {
		for event := range events {
			a.usage.Observe(event)
			// Held until a spawn claims it, so the discussion that produced a
			// plan is stored with the agents that plan created.
			a.coordinator.Observe(event)
			a.trackTaskState(event)
			runtime.EventsEmit(ctx, runtimeEventChannel, event)
		}
	}()
}

// trackTaskState keeps a task's stored state in step with its turns, so a
// reopened session shows what finished rather than everything stuck at running.
func (a *App) trackTaskState(event domain.RuntimeEvent) {
	var state domain.TaskState
	switch event.Kind {
	case domain.EventTurnCompleted:
		state = domain.TaskComplete
	case domain.EventTurnFailed:
		state = domain.TaskFailed
	default:
		return
	}

	a.workspaces.SetState(event.ThreadID, state)
	a.recorder.UpdateTaskState(event.ThreadID, state, "")
	if workspaceID, ok := a.recorder.WorkspaceOf(event.ThreadID); ok {
		a.recorder.Touch(workspaceID, event.At)
	}
}

// UsageReport returns per-CLI token spend for this app run plus current
// subscription quota.
//
// Quota is re-read on every call rather than cached, matching how each CLI's own
// settings view behaves: opening the panel shows current figures without an
// agent having to run first.
func (a *App) UsageReport() session.UsageReport {
	a.refreshQuota()
	return a.usage.Report()
}

// refreshQuota pulls limits from every CLI that exposes them locally.
//
// Only Claude does: it caches utilisation in its own config, which is re-read
// here on every call. Antigravity refreshes its token and quota in memory for
// the lifetime of a CLI process and writes neither to disk, so there is nothing
// to read and no way to authenticate a fetch without impersonating its OAuth
// client. Its quota stays in its own settings UI.
func (a *App) refreshQuota() {
	if limits, fetchedAt, err := claude.ReadQuota(""); err == nil {
		a.usage.SetLimits(domain.DriverClaude, limits, fetchedAt)
	}
}

// ResetUsage clears the counters so a single piece of work can be measured.
// Subscription quota is re-read rather than cleared: it describes the account,
// not this app's run.
func (a *App) ResetUsage() session.UsageReport {
	a.usage.Reset()
	a.refreshQuota()
	return a.usage.Report()
}

// shutdown stops every agent CLI so none outlive the window.
func (a *App) shutdown(ctx context.Context) {
	if a.stopFeed != nil {
		a.stopFeed()
	}
	a.manager.StopAll(ctx)
	// Last write wins the race with process exit: buffered transcript tails are
	// only durable once this returns.
	if a.recorder != nil {
		_ = a.recorder.Close()
	}
}

// ListHistory reports every stored session, newest first.
//
// A Catalyst session is a workspace: the orchestrator conversation plus every
// agent it spawned. Listing reads only metadata, never transcripts.
func (a *App) ListHistory() []history.Meta {
	metas, err := a.historyStore.List()
	if err != nil {
		return nil
	}
	return metas
}

// LoadHistory reopens one session in full: metadata, the orchestrator
// transcript, and every agent's transcript.
func (a *App) LoadHistory(workspaceID string) (history.Session, error) {
	return a.historyStore.Load(workspaceID)
}

// DeleteHistory removes a stored session permanently.
func (a *App) DeleteHistory(workspaceID string) error {
	return a.recorder.Forget(workspaceID)
}

// ResumeHistory restarts the agents of a stored session.
//
// Every task is attempted; the per-task outcome says whether the agent genuinely
// continued its old conversation, started fresh in the same directory, or could
// not start at all. Those are meaningfully different states and the caller is
// told which it got rather than left to assume.
func (a *App) ResumeHistory(workspaceID string) (session.ResumeResult, error) {
	loaded, err := a.historyStore.Load(workspaceID)
	if err != nil {
		return session.ResumeResult{}, err
	}

	requests := make([]session.ResumeRequest, 0, len(loaded.Meta.Tasks))
	for _, task := range loaded.Meta.Tasks {
		cwd := loaded.Meta.Workspace.Cwd
		// A task that ran in a worktree must resume there; that checkout is where
		// its work actually lives.
		if task.Worktree != nil && task.Worktree.Path != "" {
			cwd = task.Worktree.Path
		}
		requests = append(requests, session.ResumeRequest{
			ThreadID:          task.ThreadID,
			Title:             task.Title,
			Driver:            task.Driver,
			Model:             task.Model,
			Cwd:               cwd,
			ProviderSessionID: loaded.Meta.Resume[task.ThreadID],
		})
	}

	result := a.spawner.Resume(a.ctx, requests)
	result.WorkspaceID = workspaceID

	// Re-register the revived threads so their new events append to the same
	// session rather than starting a second copy of it.
	for _, outcome := range result.Outcomes {
		if !outcome.Live {
			continue
		}
		for _, task := range loaded.Meta.Tasks {
			if task.ThreadID == outcome.ThreadID {
				a.recorder.TrackTask(task)
				break
			}
		}
	}
	return result, nil
}

func (a *App) ListProviders(force bool) []domain.ProviderSnapshot {
	return a.registry.Probe(a.ctx, force)
}

func (a *App) GetProviderSettings(driver string) domain.ProviderSettings {
	return a.registry.Settings(domain.DriverKind(driver))
}

func (a *App) UpdateProviderSettings(driver string, settings domain.ProviderSettings) error {
	return a.registry.SetSettings(domain.DriverKind(driver), settings)
}

func (a *App) StartSession(driver string, input domain.SessionStartInput) (domain.Session, error) {
	return a.manager.Start(a.ctx, domain.DriverKind(driver), input)
}

func (a *App) SendTurn(input domain.SendTurnInput) error {
	return a.manager.Send(a.ctx, input)
}

func (a *App) InterruptTurn(threadID string) error {
	return a.manager.Interrupt(a.ctx, threadID)
}

func (a *App) RespondToApproval(threadID, requestID, decision string) error {
	return a.manager.Respond(a.ctx, threadID, requestID, domain.ApprovalDecision(decision))
}

func (a *App) StopSession(threadID string) error {
	return a.manager.Stop(a.ctx, threadID)
}

func (a *App) ListSessions() []domain.Session {
	return a.manager.Sessions()
}

// CoordinatorSend starts or reuses the coordinator session for the given
// selection and sends one message, returning the turn id to correlate events.
func (a *App) CoordinatorSend(cfg session.Config, text string) (string, error) {
	return a.coordinator.Send(a.ctx, cfg, text)
}

func (a *App) CoordinatorInterrupt() error {
	return a.coordinator.Interrupt(a.ctx)
}

func (a *App) CoordinatorReset() error {
	return a.coordinator.Reset(a.ctx)
}

// NewChat ends every running agent and starts a fresh orchestrator conversation.
//
// Stopping the agents is the point rather than a side effect: they hold CLI
// processes, worktrees and dev servers, and leaving them running while their
// windows disappear would strand work the user can no longer see or reach.
// Whatever they produced is already recorded, so the session stays in history.
func (a *App) NewChat() error {
	threads := a.manager.Sessions()
	for _, live := range threads {
		if live.ThreadID == session.CoordinatorThreadID {
			continue
		}
		_ = a.manager.Stop(a.ctx, live.ThreadID)
		a.workspaces.SetState(live.ThreadID, domain.TaskClosed)
		a.recorder.UpdateTaskState(live.ThreadID, domain.TaskClosed, "")
	}

	// Flushed before the transcript is cut loose, so the session that just ended
	// is complete on disk the moment it leaves the screen.
	if a.recorder != nil {
		_ = a.recorder.FlushAll()
	}
	return a.coordinator.Reset(a.ctx)
}

func (a *App) CoordinatorHistory() []domain.RuntimeEvent {
	return a.coordinator.History()
}

// ParseTasks extracts a delegation plan from an orchestrator reply. Returns an
// empty list for ordinary conversational answers.
func (a *App) ParseTasks(text string) []session.TaskRequest {
	return session.ParseTasks(text)
}

// SpawnTasks starts one agent session per task, optionally isolating each in
// its own git worktree.
func (a *App) SpawnTasks(requests []session.SpawnRequest, opts session.SpawnOptions) (session.SpawnResult, error) {
	return a.spawner.Spawn(a.ctx, requests, opts)
}

func (a *App) ListWorkspaces() []domain.Workspace {
	return a.workspaces.List()
}

func (a *App) WorkspaceTasks(workspaceID string) []domain.Task {
	return a.workspaces.Tasks(workspaceID)
}

// IsGitRepo reports whether a directory can back worktree isolation, so the UI
// can ask about it only when the answer is meaningful. An empty path means the
// app's working directory, which is what the frontend has before a project is
// explicitly chosen.
func (a *App) IsGitRepo(dir string) bool {
	if dir == "" {
		wd, err := os.Getwd()
		if err != nil {
			return false
		}
		dir = wd
	}
	_, ok := git.Open(a.ctx, dir)
	return ok
}

// TaskHandoff summarises a finished task's branch: size, commit count, and
// whether it merges cleanly. Reporting only — Catalyst never merges for you.
func (a *App) TaskHandoff(threadID string) (domain.TaskHandoff, error) {
	task, ok := a.workspaces.TaskByThread(threadID)
	if !ok {
		return domain.TaskHandoff{}, fmt.Errorf("no task for thread %s", threadID)
	}
	if task.Worktree == nil {
		return domain.TaskHandoff{TaskID: task.ID, Summary: task.Summary}, nil
	}

	repo, ok := git.Open(a.ctx, task.Worktree.Path)
	if !ok {
		return domain.TaskHandoff{}, fmt.Errorf("worktree %s is not a git repository", task.Worktree.Path)
	}

	handoff, err := repo.Handoff(a.ctx, task.Worktree)
	if err != nil {
		return domain.TaskHandoff{}, err
	}
	handoff.TaskID = task.ID
	handoff.Summary = task.Summary
	return handoff, nil
}

func (a *App) ThreadHistory(threadID string) []domain.RuntimeEvent {
	return a.manager.History(threadID)
}

// ListServers reports every listening process on the machine, grouped by the
// agent that started it. Agents routinely leave dev servers holding ports after
// a task ends, and nothing else surfaces which agent is responsible.
func (a *App) ListServers() ([]servers.Group, error) {
	owners := a.serverOwners()
	found, err := a.scanner.Scan(a.ctx, owners)
	if err != nil {
		return nil, err
	}
	return servers.Grouped(found, owners), nil
}

// StopServer terminates a listening process by PID.
func (a *App) StopServer(pid int) error {
	return a.scanner.Stop(a.ctx, pid, a.serverOwners())
}

// serverOwners pairs each live agent with its CLI process, which is what the
// scan walks parent chains toward.
func (a *App) serverOwners() []servers.Owner {
	sessions := a.manager.Sessions()
	owners := make([]servers.Owner, 0, len(sessions))
	for _, session := range sessions {
		pid, ok := a.manager.SessionPID(session.ThreadID)
		if !ok {
			continue
		}
		title := session.ThreadID
		if task, found := a.workspaces.TaskByThread(session.ThreadID); found && task.Title != "" {
			title = task.Title
		}
		owners = append(owners, servers.Owner{ThreadID: session.ThreadID, Title: title, PID: pid})
	}
	return owners
}
