package history

import (
	"sync"

	"catalyst/internal/domain"
)

// Recorder routes live events into the right workspace on disk.
//
// The manager publishes events per thread and knows nothing about workspaces,
// so this holds the thread → workspace mapping that turns a stream of
// per-thread events into a session that can be reopened as a unit.
type Recorder struct {
	store *Store

	mu sync.RWMutex
	// workspaceOf maps a thread (agent or orchestrator) to its workspace.
	workspaceOf map[string]string
	// metas is the authoritative in-memory copy, rewritten whenever it changes.
	metas map[string]*Meta
	// dirty marks workspaces whose meta needs flushing.
	dirty map[string]bool
}

func NewRecorder(store *Store) *Recorder {
	return &Recorder{
		store:       store,
		workspaceOf: make(map[string]string),
		metas:       make(map[string]*Meta),
		dirty:       make(map[string]bool),
	}
}

// OpenWorkspace registers a workspace and the orchestrator thread that produced
// it, so both are recorded together from the first event.
func (r *Recorder) OpenWorkspace(workspace domain.Workspace, coordinatorThreadID string) {
	r.mu.Lock()
	meta, ok := r.metas[workspace.ID]
	if !ok {
		meta = &Meta{Resume: make(map[string]string)}
		r.metas[workspace.ID] = meta
	}
	meta.Workspace = workspace
	if coordinatorThreadID != "" {
		meta.CoordinatorThreadID = coordinatorThreadID
		r.workspaceOf[coordinatorThreadID] = workspace.ID
	}
	snapshot := *meta
	r.mu.Unlock()

	_ = r.store.SaveMeta(snapshot)
}

// TrackTask binds an agent thread to its workspace and records the task.
func (r *Recorder) TrackTask(task domain.Task) {
	if task.WorkspaceID == "" || task.ThreadID == "" {
		return
	}

	r.mu.Lock()
	meta, ok := r.metas[task.WorkspaceID]
	if !ok {
		meta = &Meta{Resume: make(map[string]string)}
		meta.Workspace.ID = task.WorkspaceID
		r.metas[task.WorkspaceID] = meta
	}
	r.workspaceOf[task.ThreadID] = task.WorkspaceID

	replaced := false
	for i, existing := range meta.Tasks {
		if existing.ThreadID == task.ThreadID {
			meta.Tasks[i] = task
			replaced = true
			break
		}
	}
	if !replaced {
		meta.Tasks = append(meta.Tasks, task)
	}
	snapshot := *meta
	r.mu.Unlock()

	_ = r.store.SaveMeta(snapshot)
}

// Record persists one event against whichever workspace owns its thread.
//
// Events on unknown threads are dropped rather than stored loose: a thread with
// no workspace has nothing to be reopened as, and writing it would create
// directories that List could never describe.
func (r *Recorder) Record(threadID string, event domain.RuntimeEvent) {
	r.mu.RLock()
	workspaceID, ok := r.workspaceOf[threadID]
	r.mu.RUnlock()
	if !ok {
		return
	}

	_ = r.store.Append(workspaceID, threadID, event)

	// A finished turn is a natural durability point, and cheap: the buffer is
	// usually near-empty by then.
	switch event.Kind {
	case domain.EventTurnCompleted, domain.EventTurnFailed, domain.EventSessionStopped:
		_ = r.store.Flush(workspaceID)
		r.flushMeta(workspaceID)
	}
}

// NoteProviderSession stores the id needed to resume a thread in a later run.
func (r *Recorder) NoteProviderSession(threadID, providerSessionID string) {
	if providerSessionID == "" {
		return
	}

	r.mu.Lock()
	workspaceID, ok := r.workspaceOf[threadID]
	if !ok {
		r.mu.Unlock()
		return
	}
	meta, ok := r.metas[workspaceID]
	if !ok {
		r.mu.Unlock()
		return
	}
	if meta.Resume == nil {
		meta.Resume = make(map[string]string)
	}
	if meta.Resume[threadID] == providerSessionID {
		r.mu.Unlock()
		return
	}
	meta.Resume[threadID] = providerSessionID
	r.dirty[workspaceID] = true
	r.mu.Unlock()
}

// UpdateTaskState keeps the stored task list in step with the live one, so a
// reopened session shows what finished rather than what merely started.
func (r *Recorder) UpdateTaskState(threadID string, state domain.TaskState, summary string) {
	r.mu.Lock()
	workspaceID, ok := r.workspaceOf[threadID]
	if !ok {
		r.mu.Unlock()
		return
	}
	meta, ok := r.metas[workspaceID]
	if !ok {
		r.mu.Unlock()
		return
	}
	for i := range meta.Tasks {
		if meta.Tasks[i].ThreadID != threadID {
			continue
		}
		if state != "" {
			meta.Tasks[i].State = state
		}
		if summary != "" {
			meta.Tasks[i].Summary = summary
		}
		r.dirty[workspaceID] = true
		break
	}
	r.mu.Unlock()
}

// Touch updates a workspace's last-activity stamp so history sorts by use.
func (r *Recorder) Touch(workspaceID string, at int64) {
	r.mu.Lock()
	if meta, ok := r.metas[workspaceID]; ok && at > meta.Workspace.UpdatedAt {
		meta.Workspace.UpdatedAt = at
		r.dirty[workspaceID] = true
	}
	r.mu.Unlock()
}

// WorkspaceOf reports which workspace a thread belongs to.
func (r *Recorder) WorkspaceOf(threadID string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	id, ok := r.workspaceOf[threadID]
	return id, ok
}

func (r *Recorder) flushMeta(workspaceID string) {
	r.mu.Lock()
	if !r.dirty[workspaceID] {
		r.mu.Unlock()
		return
	}
	meta, ok := r.metas[workspaceID]
	if !ok {
		delete(r.dirty, workspaceID)
		r.mu.Unlock()
		return
	}
	snapshot := *meta
	delete(r.dirty, workspaceID)
	r.mu.Unlock()

	_ = r.store.SaveMeta(snapshot)
}

// FlushAll makes every open workspace durable without closing the store, so a
// session can be left behind mid-run with nothing still buffered.
func (r *Recorder) FlushAll() error {
	r.mu.Lock()
	pending := make([]Meta, 0, len(r.dirty))
	for workspaceID := range r.dirty {
		if meta, ok := r.metas[workspaceID]; ok {
			pending = append(pending, *meta)
		}
	}
	r.dirty = make(map[string]bool)
	r.mu.Unlock()

	for _, meta := range pending {
		_ = r.store.SaveMeta(meta)
	}
	return r.store.Flush("")
}

// Close flushes every pending meta and transcript.
func (r *Recorder) Close() error {
	r.mu.Lock()
	pending := make([]Meta, 0, len(r.dirty))
	for workspaceID := range r.dirty {
		if meta, ok := r.metas[workspaceID]; ok {
			pending = append(pending, *meta)
		}
	}
	r.dirty = make(map[string]bool)
	r.mu.Unlock()

	for _, meta := range pending {
		_ = r.store.SaveMeta(meta)
	}
	return r.store.Close()
}

// RecordCoordinator stores the orchestrator conversation that produced a
// workspace, and binds the thread so any later turns land in the same place.
func (r *Recorder) RecordCoordinator(workspaceID, threadID string, events []domain.RuntimeEvent) {
	if workspaceID == "" || threadID == "" {
		return
	}

	r.mu.Lock()
	meta, ok := r.metas[workspaceID]
	if !ok {
		meta = &Meta{Resume: make(map[string]string)}
		meta.Workspace.ID = workspaceID
		r.metas[workspaceID] = meta
	}
	meta.CoordinatorThreadID = threadID
	r.workspaceOf[threadID] = workspaceID
	snapshot := *meta
	r.mu.Unlock()

	for _, event := range events {
		_ = r.store.Append(workspaceID, threadID, event)
	}
	_ = r.store.Flush(workspaceID)
	_ = r.store.SaveMeta(snapshot)
}

// Forget drops a workspace from memory and disk.
func (r *Recorder) Forget(workspaceID string) error {
	r.mu.Lock()
	for threadID, id := range r.workspaceOf {
		if id == workspaceID {
			delete(r.workspaceOf, threadID)
		}
	}
	delete(r.metas, workspaceID)
	delete(r.dirty, workspaceID)
	r.mu.Unlock()

	return r.store.Delete(workspaceID)
}
