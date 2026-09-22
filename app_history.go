package main

import (
	"composer/internal/history"
	"composer/internal/session"
)

// rehydrateFromHistory rebuilds in-memory routing from disk so a restart keeps
// recording to the same workspaces instead of orphaning them.
//
// Roles stay fixed like the competitors (Zeron's journal + snapshots, Emdash's
// single SQLite): JSONL under history/ is the canonical transcript, SQLite is
// only the metadata index, and CLI-native session ids are best-effort cache.
// Without this, Workspaces starts empty and every worktree looks orphaned.
func (a *App) rehydrateFromHistory() {
	if a.historyStore == nil {
		return
	}
	metas, err := a.historyStore.List()
	if err != nil || len(metas) == 0 {
		return
	}
	for _, meta := range metas {
		if meta.Workspace.ID == "" {
			continue
		}
		if a.workspaces != nil {
			a.workspaces.Restore(meta.Workspace)
			for _, task := range meta.Tasks {
				_, _ = a.workspaces.RestoreTask(task)
			}
		}
		if a.recorder != nil {
			a.recorder.Restore(meta)
		}
	}
}

// ListHistory reports every stored session, newest first.
//
// A Composer session is a workspace: the orchestrator conversation plus every
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

// DeleteTaskHistory removes an individual chat task from history.
// If threadID is empty or it was the only task, the entire workspace is removed.
func (a *App) DeleteTaskHistory(workspaceID, threadID string) error {
	if threadID == "" {
		return a.recorder.Forget(workspaceID)
	}
	return a.recorder.ForgetCliTask(workspaceID, threadID)
}

// ResumeHistory restarts the agents of a stored session.
//
// Every task is attempted; the per-task outcome says whether the agent genuinely
// continued its old conversation, started fresh in the same directory, or could
// not start at all. Those are meaningfully different states and the caller is
// told which it got rather than left to assume.
func (a *App) ResumeHistory(workspaceID string) (session.ResumeResult, error) {
	return a.ResumeHistoryThread(workspaceID, "")
}

// ResumeHistoryThread restarts one stored agent (or every agent of the
// session when threadID is empty). Messaging one old chat must not launch a
// CLI for every other task that happened to share its workspace.
func (a *App) ResumeHistoryThread(workspaceID, threadID string) (session.ResumeResult, error) {
	loaded, err := a.historyStore.Load(workspaceID)
	if err != nil {
		return session.ResumeResult{}, err
	}

	requests := make([]session.ResumeRequest, 0, len(loaded.Meta.Tasks))
	for _, task := range loaded.Meta.Tasks {
		if threadID != "" && task.ThreadID != threadID && history.RootThreadID(task.ThreadID) != threadID {
			continue
		}
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
			Options:           task.Options,
			Cwd:               cwd,
			ProviderSessionID: loaded.Meta.Resume[task.ThreadID],
			Permission:        task.Permission,
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
