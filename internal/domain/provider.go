package domain

type DriverKind string

const (
	DriverClaude      DriverKind = "claude"
	DriverCodex       DriverKind = "codex"
	DriverAntigravity DriverKind = "antigravity"
	DriverOpenCode    DriverKind = "opencode"
)

type Transport string

const (
	TransportACP        Transport = "acp"
	TransportStreamJSON Transport = "stream-json"
	TransportAppServer  Transport = "app-server"
	TransportHTTP       Transport = "http"
)

type Availability string

const (
	AvailabilityPending     Availability = "pending"
	AvailabilityReady       Availability = "ready"
	AvailabilityUnavailable Availability = "unavailable"
	AvailabilityUnauthed    Availability = "unauthenticated"
)

type ProviderSettings struct {
	BinaryPath  string            `json:"binaryPath,omitempty"`
	LaunchArgs  string            `json:"launchArgs,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	ServerURL   string            `json:"serverUrl,omitempty"`
	APIEndpoint string            `json:"apiEndpoint,omitempty"`
	Model       string            `json:"model,omitempty"`
	Enabled     bool              `json:"enabled"`
}

type ProviderSnapshot struct {
	InstanceID   string       `json:"instanceId"`
	Driver       DriverKind   `json:"driver"`
	DisplayName  string       `json:"displayName"`
	Availability Availability `json:"availability"`
	Version      string       `json:"version,omitempty"`
	CommandPath  string       `json:"commandPath,omitempty"`
	Message      string       `json:"message,omitempty"`
	Models       []Model      `json:"models,omitempty"`
	CheckedAt    int64        `json:"checkedAt"`
}

type Model struct {
	ID          string             `json:"id"`
	DisplayName string             `json:"displayName"`
	Default     bool               `json:"default,omitempty"`
	Options     []OptionDescriptor `json:"options,omitempty"`
}

type OptionType string

const (
	OptionSelect  OptionType = "select"
	OptionBoolean OptionType = "boolean"
)

// OptionDescriptor describes one tunable knob for a model: a select (effort,
// context window) or a boolean (thinking, fast mode). Providers advertise these
// per model so the UI renders whatever a CLI actually supports.
type OptionDescriptor struct {
	ID      string         `json:"id"`
	Label   string         `json:"label"`
	Type    OptionType     `json:"type"`
	Choices []OptionChoice `json:"choices,omitempty"`
	Default any            `json:"default,omitempty"`
}

type OptionChoice struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Default bool   `json:"default,omitempty"`
}

const (
	OptionEffort        = "effort"
	OptionThinking      = "thinking"
	OptionFastMode      = "fastMode"
	OptionContextWindow = "contextWindow"
)

type PermissionMode string

const (
	PermissionDefault     PermissionMode = "default"
	PermissionAcceptEdits PermissionMode = "acceptEdits"
	PermissionPlan        PermissionMode = "plan"
	PermissionBypass      PermissionMode = "bypassPermissions"
)

type SessionStartInput struct {
	ThreadID   string         `json:"threadId"`
	InstanceID string         `json:"instanceId"`
	Cwd        string         `json:"cwd"`
	Model      string         `json:"model,omitempty"`
	Permission PermissionMode `json:"permissionMode,omitempty"`
	Resume     string         `json:"resume,omitempty"`
	Options    ModelOptions   `json:"options,omitempty"`
	// PlanOnly denies the session every tool. The orchestrator delegates rather
	// than works, and without this it explores the repo instead of answering.
	PlanOnly bool `json:"planOnly,omitempty"`
}

// ModelOptions carries the user's selections for a model's OptionDescriptors,
// keyed by descriptor id.
type ModelOptions map[string]any

func (o ModelOptions) String(id string) string {
	if value, ok := o[id].(string); ok {
		return value
	}
	return ""
}

func (o ModelOptions) Bool(id string) bool {
	value, _ := o[id].(bool)
	return value
}

type Session struct {
	ThreadID          string     `json:"threadId"`
	InstanceID        string     `json:"instanceId"`
	Driver            DriverKind `json:"driver"`
	ProviderSessionID string     `json:"providerSessionId,omitempty"`
	Cwd               string     `json:"cwd"`
	Model             string     `json:"model,omitempty"`
	StartedAt         int64      `json:"startedAt"`
}

type SendTurnInput struct {
	ThreadID string    `json:"threadId"`
	TurnID   string    `json:"turnId"`
	Text     string    `json:"text"`
	Files    []FileRef `json:"files,omitempty"`
}

type FileRef struct {
	Path string `json:"path"`
	MIME string `json:"mime,omitempty"`
}

type ApprovalDecision string

const (
	ApprovalAllowOnce   ApprovalDecision = "allowOnce"
	ApprovalAllowAlways ApprovalDecision = "allowAlways"
	ApprovalDeny        ApprovalDecision = "deny"
	ApprovalCancel      ApprovalDecision = "cancel"
)
