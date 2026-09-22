package main

import (
	"os"
	"path/filepath"

	"composer/internal/devserver"
	"composer/internal/domain"
	"composer/internal/servers"
)

// ListServers reports every listening process on the machine, grouped by the
// agent that started it. Agents routinely leave dev servers holding ports after
// a task ends, and nothing else surfaces which agent is responsible.
func (a *App) ListServers() ([]servers.Group, error) {
	owners := a.serverOwners()
	found, err := a.scanner.Scan(a.ctx, owners)
	if err != nil {
		return nil, err
	}
	return servers.Grouped(a.mergeManaged(found), owners), nil
}

func (a *App) mergeManaged(found []servers.Server) []servers.Server {
	managed := a.devservers.List()
	roots := make(map[int]devserver.Snapshot, len(managed))
	for _, snapshot := range managed {
		if snapshot.Status == devserver.StatusRunning && snapshot.PID > 0 {
			roots[snapshot.PID] = snapshot
		}
	}

	parents, _ := servers.ParentMap(a.ctx)
	claimed := make(map[string]bool, len(roots))

	out := make([]servers.Server, 0, len(found)+len(roots))
	for _, server := range found {
		if server.Agent || server.Port == servers.ComposerDevPort {
			continue
		}
		if snapshot, ok := managedRoot(server.PID, roots, parents); ok {
			claimed[snapshot.ID] = true
			server.ID = snapshot.ID
			server.Managed = true
			server.Status = string(snapshot.Status)
			server.Cwd = snapshot.Cwd
			server.OwnerThreadID = snapshot.OwnerThreadID
			server.Ours = true
			if server.Port > 0 && snapshot.Port == 0 {
				a.devservers.SetPort(snapshot.ID, server.Port)
			}
		}
		out = append(out, server)
	}

	for _, snapshot := range managed {
		if snapshot.Status != devserver.StatusRunning || claimed[snapshot.ID] {
			continue
		}
		out = append(out, servers.Server{
			PID:           snapshot.PID,
			Port:          snapshot.Port,
			Name:          snapshot.Label,
			Command:       snapshot.Command,
			Cwd:           snapshot.Cwd,
			ID:            snapshot.ID,
			Managed:       true,
			Status:        string(snapshot.Status),
			OwnerThreadID: snapshot.OwnerThreadID,
			Ours:          true,
		})
	}
	return out
}

func managedRoot(
	pid int,
	roots map[int]devserver.Snapshot,
	parents map[int]int,
) (devserver.Snapshot, bool) {
	const maxDepth = 24
	for depth := 0; depth < maxDepth && pid > 0; depth++ {
		if snapshot, ok := roots[pid]; ok {
			return snapshot, true
		}
		parent, ok := parents[pid]
		if !ok || parent == pid {
			break
		}
		pid = parent
	}
	return devserver.Snapshot{}, false
}

// StopServer terminates a listening process by PID.
func (a *App) StopServer(pid int) error {
	roots := make(map[int]devserver.Snapshot)
	for _, snapshot := range a.devservers.List() {
		if snapshot.Status == devserver.StatusRunning && snapshot.PID > 0 {
			roots[snapshot.PID] = snapshot
		}
	}
	parents, _ := servers.ParentMap(a.ctx)
	if snapshot, ok := managedRoot(pid, roots, parents); ok {
		return a.devservers.Stop(snapshot.ID)
	}
	return a.scanner.Stop(a.ctx, pid, a.serverOwners())
}

func (a *App) StartManagedServer(spec devserver.Spec) (devserver.Snapshot, error) {
	if spec.Cwd == "" {
		spec.Cwd = a.resolveCwd("")
	}
	return a.devservers.Start(spec)
}

func (a *App) ListManagedServers() []devserver.Snapshot {
	return a.devservers.List()
}

func (a *App) StopManagedServer(id string) error {
	return a.devservers.Stop(id)
}

func (a *App) ServerLogs(id string) []string {
	return a.devservers.Logs(id)
}

func (a *App) enableManagedServers() {
	// Strip special command shims and ambient PATH injection to ensure agents run
	// standard commands directly (npm run dev, go run, python, etc.) without looping
	// or stalling on external command shims.
	binDir := filepath.Join(configRoot(), "bin")
	_ = os.Remove(filepath.Join(binDir, "composer-serve.exe"))
	_ = os.Remove(filepath.Join(binDir, "composer-task.exe"))
	_ = os.Remove(filepath.Join(binDir, "composer-serve"))
	_ = os.Remove(filepath.Join(binDir, "composer-task"))
}

func (a *App) GetAgentTasks(threadID string) []domain.PlanEntry {
	if a.control == nil {
		return nil
	}
	return a.control.GetTasks(threadID)
}

func (a *App) MutateAgentTask(threadID string, action string, target string, item string) []domain.PlanEntry {
	if a.control == nil {
		return nil
	}
	return a.control.MutateTask(threadID, action, target, item)
}

// serverOwners pairs each live agent with its CLI process, which is what the
// scan walks parent chains toward.
func (a *App) serverOwners() []servers.Owner {
	return a.withManagedOwners(a.liveOwners())
}

func (a *App) liveOwners() []servers.Owner {
	sessions := a.manager.Sessions()
	owners := make([]servers.Owner, 0, len(sessions))
	for _, session := range sessions {
		pid, ok := a.manager.SessionPID(session.ThreadID)
		if !ok {
			continue
		}
		title := a.threadTitle(session.ThreadID)
		owners = append(owners, servers.Owner{ThreadID: session.ThreadID, Title: title, PID: pid})
	}
	return owners
}

func (a *App) resolveServerOwner(callerPID int) string {
	owner, ok := servers.OwnerOfPID(a.ctx, callerPID, a.liveOwners())
	if !ok {
		return ""
	}
	return owner.ThreadID
}

func (a *App) withManagedOwners(owners []servers.Owner) []servers.Owner {
	known := make(map[string]bool, len(owners))
	for _, owner := range owners {
		known[owner.ThreadID] = true
	}

	for _, snapshot := range a.devservers.List() {
		thread := snapshot.OwnerThreadID
		if thread == "" || known[thread] || snapshot.Status != devserver.StatusRunning {
			continue
		}
		known[thread] = true
		owners = append(owners, servers.Owner{ThreadID: thread, Title: a.threadTitle(thread)})
	}
	return owners
}

func (a *App) threadTitle(threadID string) string {
	if task, found := a.workspaces.TaskByThread(threadID); found && task.Title != "" {
		return task.Title
	}
	return threadID
}
