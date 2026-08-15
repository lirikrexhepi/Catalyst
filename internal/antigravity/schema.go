package antigravity

import "encoding/json"

type ToolInfo struct {
	Name       string          `json:"name"`
	Parameters json.RawMessage `json:"parameters,omitempty"`
	Output     string          `json:"output,omitempty"`
	Error      string          `json:"error,omitempty"`
}

type Usage struct {
	InputTokens     int64 `json:"input_tokens"`
	OutputTokens    int64 `json:"output_tokens"`
	ThinkingTokens  int64 `json:"thinking_tokens"`
	CacheReadTokens int64 `json:"cache_read_tokens"`
	TotalTokens     int64 `json:"total_tokens"`
}

type StepUpdate struct {
	ConversationID string    `json:"conversation_id"`
	StepIndex      int       `json:"step_index"`
	State          string    `json:"state"`
	StepType       string    `json:"step_type"`
	TextDelta      string    `json:"text_delta,omitempty"`
	ToolName       string    `json:"tool_name,omitempty"`
	ToolInfo       *ToolInfo `json:"tool_info,omitempty"`
	Usage          *Usage    `json:"usage,omitempty"`
}

type Init struct {
	Cwd            string   `json:"cwd"`
	Tools          []string `json:"tools,omitempty"`
	PermissionMode string   `json:"permission_mode,omitempty"`
}

type Result struct {
	ConversationID string `json:"conversation_id"`
	Status         string `json:"status"`
	Response       string `json:"response"`
	NumTurns       int    `json:"num_turns"`
	Usage          *Usage `json:"usage,omitempty"`
	Error          string `json:"error,omitempty"`
}

// Envelope is one NDJSON line from `agy --output-format stream-json`.
type Envelope struct {
	Event          string      `json:"event"`
	ConversationID string      `json:"conversation_id,omitempty"`
	Init           *Init       `json:"init,omitempty"`
	StepUpdate     *StepUpdate `json:"step_update,omitempty"`
	Result         *Result     `json:"result,omitempty"`
}

const (
	StateActive = "ACTIVE"
	StateDone   = "DONE"
	StateError  = "ERROR"
)
