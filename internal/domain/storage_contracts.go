package domain

import (
	"context"
	"time"
)

// SessionRecord represents an individual agent session in Composer.
// Each session is an independent worker dedicated to a task or feature.
type SessionRecord struct {
	ID           string    `json:"id"`
	WorkspaceID  string    `json:"workspaceId,omitempty"`
	Title        string    `json:"title"`
	CustomName   string    `json:"customName,omitempty"`
	ProjectPath  string    `json:"projectPath"`
	Branch       string    `json:"branch,omitempty"`
	Driver       string    `json:"driver"`
	Model        string    `json:"model"`
	CLISessionID string    `json:"cliSessionId,omitempty"`
	Status       string    `json:"status"` // "active", "idle", "completed", "archived"
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (s SessionRecord) DisplayName() string {
	if s.CustomName != "" {
		return s.CustomName
	}
	return s.Title
}

// SessionRepository defines the contract for session metadata persistence.
type SessionRepository interface {
	Save(ctx context.Context, s SessionRecord) error
	Get(ctx context.Context, id string) (*SessionRecord, error)
	Rename(ctx context.Context, id string, customName string) error
	UpdateCLISession(ctx context.Context, id string, cliSessionID string) error
	UpdateStatus(ctx context.Context, id string, status string) error
	List(ctx context.Context, limit int) ([]SessionRecord, error)
	Delete(ctx context.Context, id string) error
}

// TaskRecord represents a first-class task item.
// Today it models interactive agent tasklists; in the future it also supports
// unassigned or cron-scheduled tasks executed by autonomous background workers.
type TaskRecord struct {
	ID          int64      `json:"id"`
	SessionID   *string    `json:"sessionId,omitempty"`
	Content     string     `json:"content"`
	Status      string     `json:"status"` // "pending", "in_progress", "done", "failed", "cancelled"
	Priority    string     `json:"priority"`
	OrderIndex  int        `json:"orderIndex"`
	Source      string     `json:"source"` // "agent", "user", "cron", "queue"
	ScheduledAt *time.Time `json:"scheduledAt,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// TaskRepository defines the contract for tasklist and queue operations.
type TaskRepository interface {
	SetSessionTasks(ctx context.Context, sessionID string, tasks []TaskRecord) error
	AddTask(ctx context.Context, task TaskRecord) (int64, error)
	UpdateStatus(ctx context.Context, taskID int64, status string) error
	UpdateStatusBySessionAndTarget(ctx context.Context, sessionID string, target string, status string) error
	RemoveTask(ctx context.Context, taskID int64) error
	RemoveTaskBySessionAndTarget(ctx context.Context, sessionID string, target string) error
	ListBySession(ctx context.Context, sessionID string) ([]TaskRecord, error)
	ListScheduledPending(ctx context.Context, before time.Time, limit int) ([]TaskRecord, error)
}

// ProviderRecord tracks provider permissions and preferences.
type ProviderRecord struct {
	ID                  string     `json:"id"`
	Name                string     `json:"name"`
	IsEnabled           bool       `json:"isEnabled"`
	PreferredModel      string     `json:"preferredModel,omitempty"`
	BinaryPath          string     `json:"binaryPath,omitempty"`
	PermissionGrantedAt *time.Time `json:"permissionGrantedAt,omitempty"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}

// ProviderRepository defines persistence for provider settings and authorizations.
type ProviderRepository interface {
	Get(ctx context.Context, id string) (*ProviderRecord, error)
	SetPreferredModel(ctx context.Context, id string, modelID string) error
	SetPermission(ctx context.Context, id string, enabled bool) error
	Save(ctx context.Context, record ProviderRecord) error
	List(ctx context.Context) ([]ProviderRecord, error)
}

// PreferenceRepository defines key-value configuration storage.
type PreferenceRepository interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value string) error
	All(ctx context.Context) (map[string]string, error)
}

// ProjectRecord represents a discovered or opened project directory.
type ProjectRecord struct {
	Path         string    `json:"path"`
	Name         string    `json:"name"`
	IsGit        bool      `json:"isGit"`
	LastOpenedAt time.Time `json:"lastOpenedAt"`
	CreatedAt    time.Time `json:"createdAt"`
}

// ProjectRepository defines persistence for recent projects.
type ProjectRepository interface {
	Upsert(ctx context.Context, p ProjectRecord) error
	List(ctx context.Context) ([]ProjectRecord, error)
	Delete(ctx context.Context, path string) error
}
