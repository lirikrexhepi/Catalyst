package claude

import "encoding/json"

type ContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	Thinking  string          `json:"thinking,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
	Content   json.RawMessage `json:"content,omitempty"`
	IsError   bool            `json:"is_error,omitempty"`
}

type Message struct {
	Role       string         `json:"role"`
	Content    []ContentBlock `json:"content"`
	Model      string         `json:"model,omitempty"`
	StopReason string         `json:"stop_reason,omitempty"`
	Usage      *Usage         `json:"usage,omitempty"`
}

type Usage struct {
	InputTokens              int64 `json:"input_tokens"`
	OutputTokens             int64 `json:"output_tokens"`
	CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
	CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
}

// Envelope is the union of every line the CLI emits on stdout under
// --output-format stream-json.
type Envelope struct {
	Type      string          `json:"type"`
	Subtype   string          `json:"subtype,omitempty"`
	SessionID string          `json:"session_id,omitempty"`
	Message   *Message        `json:"message,omitempty"`
	Model     string          `json:"model,omitempty"`
	Tools     []string        `json:"tools,omitempty"`
	Cwd       string          `json:"cwd,omitempty"`
	Event     json.RawMessage `json:"event,omitempty"`

	IsError    bool    `json:"is_error,omitempty"`
	StopReason string  `json:"stop_reason,omitempty"`
	Result     string  `json:"result,omitempty"`
	TotalCost  float64 `json:"total_cost_usd,omitempty"`
	NumTurns   int     `json:"num_turns,omitempty"`
	Usage      *Usage  `json:"usage,omitempty"`

	RateLimitInfo *RateLimitInfo `json:"rate_limit_info,omitempty"`
}

// RateLimitInfo rides on `type: "rate_limit_event"` frames and is the only place
// the CLI reports subscription quota. Fields beyond the window type and reset are
// optional: an unconstrained account reports status and reset with no percentage.
type RateLimitInfo struct {
	Status        string `json:"status,omitempty"`
	RateLimitType string `json:"rateLimitType,omitempty"`
	ResetsAt      int64  `json:"resetsAt,omitempty"`
	UsedPercent   *int   `json:"usedPercent,omitempty"`
	RemainingPct  *int   `json:"remainingPercent,omitempty"`
}

type InputMessage struct {
	Type    string       `json:"type"`
	Message InputContent `json:"message"`
}

type InputContent struct {
	Role    string         `json:"role"`
	Content []ContentBlock `json:"content"`
}

func UserText(text string) InputMessage {
	return InputMessage{
		Type:    "user",
		Message: InputContent{Role: "user", Content: []ContentBlock{{Type: "text", Text: text}}},
	}
}

type ControlRequest struct {
	Type      string          `json:"type"`
	RequestID string          `json:"request_id"`
	Request   json.RawMessage `json:"request"`
}
