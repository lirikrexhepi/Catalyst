package history

import "catalyst/internal/domain"

// CoordinatorBinder is the part of the coordinator history needs: handing over
// the conversation that produced a workspace.
type CoordinatorBinder interface {
	BindWorkspace(workspaceID string) string
}

// Tracker adapts the recorder to the spawner's expectations, joining the
// orchestrator transcript to the workspace its plan created.
//
// Exists so neither the session package nor the coordinator has to know about
// the history package: the spawner sees an interface, and this supplies it.
type Tracker struct {
	recorder    *Recorder
	coordinator CoordinatorBinder
}

func NewTracker(recorder *Recorder, coordinator CoordinatorBinder) *Tracker {
	return &Tracker{recorder: recorder, coordinator: coordinator}
}

// BindCoordinator hands the current orchestrator conversation to the workspace
// and reports the thread id it was filed under.
func (t *Tracker) BindCoordinator(workspaceID string) string {
	if t.coordinator == nil {
		return ""
	}
	return t.coordinator.BindWorkspace(workspaceID)
}

func (t *Tracker) OpenWorkspace(workspace domain.Workspace, coordinatorThreadID string) {
	t.recorder.OpenWorkspace(workspace, coordinatorThreadID)
}

func (t *Tracker) TrackTask(task domain.Task) {
	t.recorder.TrackTask(task)
}
