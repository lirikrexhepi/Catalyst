package session

import (
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"catalyst/internal/domain"
)

// Workspaces holds the workspace/task graph in memory. Persistence is not wired
// yet; the shape is fixed now so history can be added without reworking callers.
type Workspaces struct {
	mu         sync.RWMutex
	workspaces map[string]*domain.Workspace
	tasks      map[string]*domain.Task
	byThread   map[string]string

	seq atomic.Uint64
}

func NewWorkspaces() *Workspaces {
	return &Workspaces{
		workspaces: make(map[string]*domain.Workspace),
		tasks:      make(map[string]*domain.Task),
		byThread:   make(map[string]string),
	}
}

func (w *Workspaces) nextID(prefix string) string {
	return prefix + "-" + strconv.FormatUint(w.seq.Add(1), 10) + "-" + strconv.FormatInt(time.Now().UnixMilli(), 36)
}

// Create opens a workspace for one orchestrator request. Every task spawned
// from that request hangs off it, which is how history groups later.
func (w *Workspaces) Create(title, prompt, cwd string) *domain.Workspace {
	now := time.Now().UnixMilli()
	workspace := &domain.Workspace{
		ID:        w.nextID("ws"),
		Title:     title,
		Prompt:    prompt,
		Cwd:       cwd,
		CreatedAt: now,
		UpdatedAt: now,
	}

	w.mu.Lock()
	w.workspaces[workspace.ID] = workspace
	w.mu.Unlock()
	return workspace
}

func (w *Workspaces) AddTask(workspaceID string, task domain.Task) (*domain.Task, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()

	workspace, ok := w.workspaces[workspaceID]
	if !ok {
		return nil, false
	}

	now := time.Now().UnixMilli()
	task.ID = w.nextID("task")
	task.WorkspaceID = workspaceID
	task.CreatedAt = now
	task.UpdatedAt = now
	if task.State == "" {
		task.State = domain.TaskPending
	}

	stored := &task
	w.tasks[task.ID] = stored
	w.byThread[task.ThreadID] = task.ID
	workspace.UpdatedAt = now
	return stored, true
}

func (w *Workspaces) TaskByThread(threadID string) (*domain.Task, bool) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	id, ok := w.byThread[threadID]
	if !ok {
		return nil, false
	}
	task, ok := w.tasks[id]
	return task, ok
}

func (w *Workspaces) SetState(threadID string, state domain.TaskState) {
	w.mu.Lock()
	defer w.mu.Unlock()

	id, ok := w.byThread[threadID]
	if !ok {
		return
	}
	if task, ok := w.tasks[id]; ok {
		task.State = state
		task.UpdatedAt = time.Now().UnixMilli()
	}
}

// SetSummary records a task's compacted context. Captured while the agent is
// still alive so a crashed or force-closed session keeps its history.
func (w *Workspaces) SetSummary(threadID, summary string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	id, ok := w.byThread[threadID]
	if !ok {
		return
	}
	if task, ok := w.tasks[id]; ok {
		task.Summary = summary
		task.UpdatedAt = time.Now().UnixMilli()
	}
}

func (w *Workspaces) List() []domain.Workspace {
	w.mu.RLock()
	defer w.mu.RUnlock()

	out := make([]domain.Workspace, 0, len(w.workspaces))
	for _, workspace := range w.workspaces {
		out = append(out, *workspace)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out
}

func (w *Workspaces) Tasks(workspaceID string) []domain.Task {
	w.mu.RLock()
	defer w.mu.RUnlock()

	out := make([]domain.Task, 0, 4)
	for _, task := range w.tasks {
		if task.WorkspaceID == workspaceID {
			out = append(out, *task)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	return out
}
