package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"composer/internal/domain"
	"composer/internal/logger"
	"composer/internal/remote"
	"composer/internal/servers"
	"composer/internal/session"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) GetRemoteInfo() remote.RemoteInfo {
	if a.remoteServer == nil {
		return remote.RemoteInfo{Enabled: false}
	}
	return a.remoteServer.Info()
}

func (a *App) StartRemoteServer(port int) (remote.RemoteInfo, error) {
	if a.remoteServer == nil {
		a.remoteServer = remote.NewServer(port, a.manager, a.coordinator, a.orchestrator, a.spawner, a.projects, a.recorder, a.historyStore)
		a.wireRemote()
	}
	if err := a.remoteServer.Start(context.Background()); err != nil {
		logger.Errorf("App", "Failed to start remote server: %v", err)
		return a.remoteServer.Info(), err
	}
	return a.remoteServer.Info(), nil
}

func (a *App) StopRemoteServer() error {
	if a.remoteServer != nil {
		a.remoteServer.Stop()
	}
	return nil
}

func (a *App) RegenerateRemoteToken() (remote.RemoteInfo, error) {
	if a.remoteServer == nil {
		return remote.RemoteInfo{Enabled: false}, nil
	}
	return a.remoteServer.RegenerateToken(), nil
}

// wireRemote gives the phone API the app-level operations it shares with the
// desktop: model switching (with handoff across providers), spawning with
// project context, provider discovery and attachment storage.
func (a *App) wireRemote() {
	if a.remoteServer == nil {
		return
	}
	a.remoteServer.SetHooks(remote.Hooks{
		Providers: func(force bool) []domain.ProviderSnapshot {
			// Bounded so a slow CLI probe cannot outlive the HTTP write timeout
			// and leave the phone with no providers at all.
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			return a.registry.Probe(ctx, force)
		},
		SendAgent:  a.remoteSendAgent,
		NewAgent:   a.remoteNewAgent,
		SaveUpload: a.remoteSaveUpload,
		Servers: func() []servers.Group {
			groups, _ := a.ListServers()
			return groups
		},
	})
}

// remoteSendAgent sends a phone message to a worker. When the phone picked a
// different provider the thread is continued on it with a handoff (the
// message rides in the same turn); a different model or effort on the same
// provider is applied before sending.
func (a *App) remoteSendAgent(ctx context.Context, threadID, text string, files []domain.FileRef, choice *remote.ModelChoice) error {
	if err := a.orchestrator.EnsureLive(ctx, threadID); err != nil {
		return err
	}
	if choice != nil && choice.Driver != "" {
		task, ok := a.workspaces.TaskByThread(threadID)
		if ok && domain.DriverKind(choice.Driver) != task.Driver {
			_, err := a.SwitchTaskProviderWithOptions(threadID, choice.Driver, choice.Model, choice.Options, "", "", text, files)
			return err
		}
		if ok && (choice.Model != task.Model || !sameModelOptions(task.Options, choice.Options)) {
			if _, err := a.UpdateTaskModel(threadID, choice.Driver, choice.Model, choice.Options, "", ""); err != nil {
				return err
			}
		}
	}
	turnID := fmt.Sprintf("%s-turn-%d", threadID, time.Now().UnixMilli())
	a.manager.RecordUserMessage(threadID, turnID, text, files...)
	a.workspaces.SetState(threadID, domain.TaskRunning)
	return a.manager.Send(ctx, domain.SendTurnInput{ThreadID: threadID, TurnID: turnID, Text: text, Files: files})
}

// remoteNewAgent starts an agent from the phone and puts it on the desktop
// deck too, the same way orchestrator launches appear there.
func (a *App) remoteNewAgent(ctx context.Context, req remote.NewAgentRequest) (string, error) {
	permission := domain.PermissionDefault
	if req.AutoApprove {
		permission = domain.PermissionBypass
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = strings.TrimSpace(req.Prompt)
		if len([]rune(title)) > 40 {
			title = string([]rune(title)[:40]) + "…"
		}
	}
	result, err := a.SpawnTasks(
		[]session.SpawnRequest{{
			Title: title, Prompt: req.Prompt, Cwd: req.Cwd,
			Driver: domain.DriverKind(req.Choice.Driver), Model: req.Choice.Model, Options: req.Choice.Options,
		}},
		session.SpawnOptions{
			Driver: domain.DriverKind(req.Choice.Driver), Model: req.Choice.Model, Options: req.Choice.Options,
			Cwd: req.Cwd, Title: title, Prompt: req.Prompt, Permission: permission,
		},
	)
	if err != nil {
		return "", err
	}
	if len(result.Tasks) == 0 {
		return "", fmt.Errorf("no agent was started")
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, orchestratorSpawnedChannel, result)
	}
	return result.Tasks[0].ThreadID, nil
}

func (a *App) remoteSaveUpload(name, mime, payload string) (domain.FileRef, error) {
	saved, err := a.attachments.Save(name, mime, payload)
	if err != nil {
		return domain.FileRef{}, err
	}
	return domain.FileRef{Path: saved.Path, MIME: saved.MIME}, nil
}
