package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"composer/internal/devserver"
	"composer/internal/remote"
	"composer/internal/shell"
)

var errNoDevScript = errors.New("this project has no dev, start or serve script in package.json")

var devScriptNames = []string{"dev", "start", "serve"}

type devScript struct {
	manager string
	script  string
}

func detectDevScript(cwd string) (devScript, error) {
	raw, err := os.ReadFile(filepath.Join(cwd, "package.json"))
	if err != nil {
		return devScript{}, errNoDevScript
	}
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(raw, &pkg); err != nil {
		return devScript{}, fmt.Errorf("package.json could not be read: %w", err)
	}
	script := ""
	for _, name := range devScriptNames {
		if strings.TrimSpace(pkg.Scripts[name]) != "" {
			script = name
			break
		}
	}
	if script == "" {
		return devScript{}, errNoDevScript
	}
	return devScript{manager: packageManager(cwd), script: script}, nil
}

func packageManager(cwd string) string {
	lockfiles := []struct{ file, manager string }{
		{"pnpm-lock.yaml", "pnpm"},
		{"yarn.lock", "yarn"},
		{"bun.lockb", "bun"},
		{"bun.lock", "bun"},
	}
	env := shell.BaseEnvironment()
	for _, l := range lockfiles {
		if _, err := os.Stat(filepath.Join(cwd, l.file)); err != nil {
			continue
		}
		if _, ok := shell.LookPath(l.manager, env); ok {
			return l.manager
		}
	}
	return "npm"
}

func (a *App) threadCwd(threadID string) string {
	task, ok := a.workspaces.TaskByThread(threadID)
	if !ok {
		return ""
	}
	if task.Worktree != nil && task.Worktree.Path != "" {
		return task.Worktree.Path
	}
	if ws := a.workspaces.Get(task.WorkspaceID); ws != nil {
		return ws.Cwd
	}
	return ""
}

func (a *App) managedSnapshot(id string) (devserver.Snapshot, bool) {
	for _, snap := range a.devservers.List() {
		if snap.ID == id {
			return snap, true
		}
	}
	return devserver.Snapshot{}, false
}

func (a *App) runningDevServerIn(cwd string) (devserver.Snapshot, bool) {
	for _, snap := range a.devservers.List() {
		if snap.Status == devserver.StatusRunning && samePath(snap.Cwd, cwd) {
			return snap, true
		}
	}
	return devserver.Snapshot{}, false
}

func (a *App) remoteStartDevServer(_ context.Context, req remote.DevServerRequest) (remote.DevServerInfo, error) {
	cwd := req.Cwd
	if req.ThreadID != "" {
		if found := a.threadCwd(req.ThreadID); found != "" {
			cwd = found
		}
	}
	cwd, err := a.requireCwd(cwd)
	if err != nil {
		return remote.DevServerInfo{}, err
	}

	if snap, ok := a.runningDevServerIn(cwd); ok {
		a.queueDevServerNote(req.ThreadID, snap.ID)
		return devServerInfo(snap, nil), nil
	}

	script, err := detectDevScript(cwd)
	if err != nil {
		return remote.DevServerInfo{}, err
	}
	snap, err := a.devservers.Start(devserver.Spec{
		Label:         filepath.Base(cwd),
		Command:       script.manager,
		Args:          []string{"run", script.script},
		Cwd:           cwd,
		Env:           map[string]string{"BROWSER": "none"},
		OwnerThreadID: req.ThreadID,
	})
	if err != nil {
		return remote.DevServerInfo{}, err
	}
	a.queueDevServerNote(req.ThreadID, snap.ID)
	go a.warmPreviewWhenListening(snap.ID)
	return devServerInfo(snap, nil), nil
}

func (a *App) remoteDevServerStatus(id string) (remote.DevServerInfo, bool) {
	snap, ok := a.managedSnapshot(id)
	if !ok {
		return remote.DevServerInfo{}, false
	}
	var log []string
	if snap.Status != devserver.StatusRunning {
		log = tail(a.devservers.Logs(id), 6)
	}
	return devServerInfo(snap, log), true
}

func (a *App) warmPreviewWhenListening(id string) {
	deadline := time.Now().Add(3 * time.Minute)
	for time.Now().Before(deadline) {
		snap, ok := a.managedSnapshot(id)
		if !ok || snap.Status != devserver.StatusRunning {
			return
		}
		if snap.Port > 0 {
			if a.remoteServer != nil {
				a.remoteServer.WarmPreview(snap.Port)
			}
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
}

func (a *App) queueDevServerNote(threadID, id string) {
	if threadID == "" {
		return
	}
	a.manager.QueueTurnNote(threadID, func() string {
		snap, ok := a.managedSnapshot(id)
		if !ok || snap.Status != devserver.StatusRunning {
			return ""
		}
		where := snap.URL
		if where == "" {
			where = "its usual local port"
		}
		return fmt.Sprintf("[Note from the Orchestrator app, not the user: the app already started this project's dev server with `%s` in %s and it is running at %s. Use that server. Do not start, restart or stop dev servers unless the user asks.]", snap.Command, snap.Cwd, where)
	})
}

func devServerInfo(snap devserver.Snapshot, log []string) remote.DevServerInfo {
	return remote.DevServerInfo{
		ID:      snap.ID,
		Name:    snap.Label,
		Command: snap.Command,
		Cwd:     snap.Cwd,
		Port:    snap.Port,
		Status:  string(snap.Status),
		Log:     log,
	}
}

func tail(lines []string, n int) []string {
	if len(lines) <= n {
		return lines
	}
	return lines[len(lines)-n:]
}
