package domain

// Workspace groups every session spawned from one orchestrator prompt. It is
// the unit history is organised by — the equivalent of a "project" in other
// agent apps, except the grouping key is the originating request rather than a
// directory.
type Workspace struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Prompt    string `json:"prompt"`
	Cwd       string `json:"cwd"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	Archived  bool   `json:"archived,omitempty"`
}

type TaskState string

const (
	TaskPending  TaskState = "pending"
	TaskRunning  TaskState = "running"
	TaskComplete TaskState = "complete"
	TaskFailed   TaskState = "failed"
	TaskClosed   TaskState = "closed"
)

// Task is one unit of delegated work: a thread, the agent running it, and the
// isolation it was given.
type Task struct {
	ID          string     `json:"id"`
	WorkspaceID string     `json:"workspaceId"`
	ThreadID    string     `json:"threadId"`
	Title       string     `json:"title"`
	Prompt      string     `json:"prompt"`
	Driver      DriverKind `json:"driver"`
	Model       string     `json:"model,omitempty"`
	State       TaskState  `json:"state"`

	Worktree *Worktree `json:"worktree,omitempty"`
	// Summary is captured at turn completion rather than on close, so context
	// survives a crashed or force-closed session.
	Summary   string `json:"summary,omitempty"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// Worktree records the isolated checkout a task ran in. Catalyst creates and
// reports these; merging stays a human decision.
type Worktree struct {
	Path       string `json:"path"`
	Branch     string `json:"branch"`
	BaseBranch string `json:"baseBranch"`
	CreatedAt  int64  `json:"createdAt"`
}

// TaskHandoff is the reconciliation view shown when work finishes: what changed
// and whether it can land cleanly. Catalyst reports; it does not merge.
type TaskHandoff struct {
	TaskID       string   `json:"taskId"`
	Branch       string   `json:"branch"`
	FilesChanged int      `json:"filesChanged"`
	Insertions   int      `json:"insertions"`
	Deletions    int      `json:"deletions"`
	Commits      int      `json:"commits"`
	Conflicts    []string `json:"conflicts,omitempty"`
	CleanMerge   bool     `json:"cleanMerge"`
	Summary      string   `json:"summary,omitempty"`
}
