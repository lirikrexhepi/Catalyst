package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"composer/internal/domain"
	"composer/internal/git"
	"composer/internal/projects"
	"composer/internal/logger"
	"composer/internal/remote"
	"composer/internal/servers"
	"composer/internal/session"

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
		a.remoteServer.SetStoragePath(filepath.Join(configRoot(), "remote_auth.json"))
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
	var powerOff func() error
	if a.headless {
		// Only offered headless: with the window open someone is at the PC.
		powerOff = a.remotePowerOff
	}
	a.remoteServer.SetHooks(remote.Hooks{
		PowerOff: powerOff,
		Workspace: remote.WorkspaceHooks{
			GitOverview: a.remoteGitOverview,
			GitFileDiff: func(ctx context.Context, checkout, file string, staged bool) (domain.DiffFile, error) {
				if _, err := a.treeRoot(ctx, checkout); err != nil {
					return domain.DiffFile{}, err
				}
				return a.GitFileDiff(checkout, file, staged)
			},
			GitCommitDiff: func(ctx context.Context, checkout, sha string) ([]domain.DiffFile, error) {
				if _, err := a.treeRoot(ctx, checkout); err != nil {
					return nil, err
				}
				return a.GitCommitDiff(checkout, sha)
			},
			Tree:       a.projectTree,
			TreeStatus: a.projectTreeStatus,
			ReadFile:   a.projectFile,
			AddProject: a.remoteAddProject,
		},
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
	return a.manager.Send(ctx, domain.SendTurnInput{ThreadID: threadID, TurnID: turnID, Text: text + "\n\n" + remote.SessionNote, Files: files})
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
	a.emit(orchestratorSpawnedChannel, result)
	return result.Tasks[0].ThreadID, nil
}

// remoteGitOverview is the git overview for a project the phone names. An
// empty name means the desktop's active project.
func (a *App) remoteGitOverview(ctx context.Context, project string) ([]domain.WorktreeChanges, error) {
	root, err := a.treeRoot(ctx, project)
	if err != nil {
		return nil, err
	}
	return a.gitOverviewAt(ctx, root)
}

// remoteAddProject saves a folder chosen on the phone without making it the
// desktop's active project, then tells an open window its list changed.
func (a *App) remoteAddProject(ctx context.Context, path string) (projects.Project, error) {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return projects.Project{}, fmt.Errorf("%s is not a folder", path)
	}
	_, isGit := git.Open(ctx, path)
	project, err := a.projects.Remember(path, isGit)
	if err != nil {
		return projects.Project{}, err
	}
	a.emit(projectsChangedChannel)
	return project, nil
}

// remotePowerOff schedules a Windows shutdown, then stops the app so history
// and the database are closed before the OS gets there. Scheduling first means
// a refused shutdown is reported to the phone and leaves the app running.
func (a *App) remotePowerOff() error {
	if err := scheduleSystemShutdown(15 * time.Second); err != nil {
		logger.Errorf("App", "Remote shutdown refused: %v", err)
		return err
	}
	logger.Infof("App", "Windows shutdown scheduled from the phone")
	if a.requestStop != nil {
		// Let the phone's request finish before the gateway goes away.
		time.AfterFunc(500*time.Millisecond, func() { a.requestStop("shutdown requested from the phone") })
	}
	return nil
}

func (a *App) remoteSaveUpload(name, mime, payload string) (domain.FileRef, error) {
	saved, err := a.attachments.Save(name, mime, payload)
	if err != nil {
		return domain.FileRef{}, err
	}
	return domain.FileRef{Path: saved.Path, MIME: saved.MIME}, nil
}
