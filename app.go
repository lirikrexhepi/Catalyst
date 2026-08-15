package main

import (
	"context"
	"fmt"
	"os"

	"catalyst/internal/domain"
	"catalyst/internal/drivers"
	"catalyst/internal/git"
	"catalyst/internal/provider"
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
	stopFeed    func()
}

func NewApp() *App {
	registry := provider.NewRegistry(drivers.All()...)
	manager := session.NewManager(registry)
	workspaces := session.NewWorkspaces()
	return &App{
		registry:    registry,
		manager:     manager,
		coordinator: session.NewCoordinator(manager),
		workspaces:  workspaces,
		spawner:     session.NewSpawner(manager, workspaces),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	events, cancel := a.manager.Bus().Subscribe()
	a.stopFeed = cancel

	go func() {
		for event := range events {
			runtime.EventsEmit(ctx, runtimeEventChannel, event)
		}
	}()
}

// shutdown stops every agent CLI so none outlive the window.
func (a *App) shutdown(ctx context.Context) {
	if a.stopFeed != nil {
		a.stopFeed()
	}
	a.manager.StopAll(ctx)
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
