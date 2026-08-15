package opencode

import "encoding/json"

type Session struct {
	ID       string `json:"id"`
	Title    string `json:"title,omitempty"`
	ParentID string `json:"parentID,omitempty"`
}

type CreateSessionRequest struct {
	Title string `json:"title,omitempty"`
}

type FilePart struct {
	Type     string `json:"type"`
	MIME     string `json:"mime,omitempty"`
	URL      string `json:"url,omitempty"`
	Filename string `json:"filename,omitempty"`
}

type TextPart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type PromptRequest struct {
	MessageID string `json:"messageID,omitempty"`
	Model     string `json:"model,omitempty"`
	Agent     string `json:"agent,omitempty"`
	Parts     []any  `json:"parts"`
}

type PermissionReply struct {
	Response string `json:"response"`
}

// Event is one frame from GET /event. `properties` carries the variant payload.
type Event struct {
	Type       string          `json:"type"`
	Properties json.RawMessage `json:"properties"`
}

type MessageInfo struct {
	ID         string `json:"id"`
	SessionID  string `json:"sessionID"`
	Role       string `json:"role"`
	ProviderID string `json:"providerID,omitempty"`
	ModelID    string `json:"modelID,omitempty"`
	Time       struct {
		Created   float64 `json:"created,omitempty"`
		Completed float64 `json:"completed,omitempty"`
	} `json:"time"`
	Tokens *Tokens         `json:"tokens,omitempty"`
	Cost   float64         `json:"cost,omitempty"`
	Error  json.RawMessage `json:"error,omitempty"`
}

type Tokens struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
	Cache  struct {
		Read  int64 `json:"read"`
		Write int64 `json:"write"`
	} `json:"cache"`
}

type ToolState struct {
	Status string          `json:"status"`
	Input  json.RawMessage `json:"input,omitempty"`
	Output string          `json:"output,omitempty"`
	Title  string          `json:"title,omitempty"`
	Error  string          `json:"error,omitempty"`
}

type Part struct {
	ID        string     `json:"id"`
	SessionID string     `json:"sessionID"`
	MessageID string     `json:"messageID"`
	Type      string     `json:"type"`
	Text      string     `json:"text,omitempty"`
	Tool      string     `json:"tool,omitempty"`
	CallID    string     `json:"callID,omitempty"`
	State     *ToolState `json:"state,omitempty"`
}

type MessageUpdatedProperties struct {
	Info MessageInfo `json:"info"`
}

type PartUpdatedProperties struct {
	Part Part `json:"part"`
}

type SessionIdleProperties struct {
	SessionID string `json:"sessionID"`
}

type SessionErrorProperties struct {
	SessionID string          `json:"sessionID"`
	Error     json.RawMessage `json:"error"`
}

type PermissionProperties struct {
	ID        string          `json:"id"`
	SessionID string          `json:"sessionID"`
	MessageID string          `json:"messageID,omitempty"`
	Title     string          `json:"title,omitempty"`
	Type      string          `json:"type,omitempty"`
	Pattern   string          `json:"pattern,omitempty"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
}
