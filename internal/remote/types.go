package remote

import "composer/internal/domain"

// RemoteInfo describes the running remote server status and pairing details.
type RemoteInfo struct {
	Enabled       bool     `json:"enabled"`
	Port          int      `json:"port"`
	Token         string   `json:"token"`
	PIN           string   `json:"pin"`
	LocalURL      string   `json:"localUrl,omitempty"`
	TailscaleURL  string   `json:"tailscaleUrl,omitempty"`
	PublicURL     string   `json:"publicUrl,omitempty"`
	BestURL       string   `json:"bestUrl"`
	QRCodeSVG     string   `json:"qrCodeSvg"`
	ActiveClients int      `json:"activeClients"`
	Hostname      string   `json:"hostname"`
	LANIPs        []string `json:"lanIps,omitempty"`
	Connecting    bool     `json:"connecting"`
	Downloading   bool     `json:"downloading"`
	Error         string   `json:"error,omitempty"`
}

// ClientMessage is sent from the phone to the orchestrator over WebSocket.
type ClientMessage struct {
	Action    string         `json:"action"` // "send_coordinator", "interrupt_coordinator", "execute_plan", "send_agent", "stop_agent", "new_chat", "approve", "answer_question"
	Text      string         `json:"text,omitempty"`
	ThreadID  string         `json:"threadId,omitempty"`
	Model     string         `json:"model,omitempty"`
	Driver    string         `json:"driver,omitempty"`
	Tasks     []PlanTaskItem `json:"tasks,omitempty"`
	Decision  string         `json:"decision,omitempty"`
	RequestID string         `json:"requestId,omitempty"`
	Answers   []string       `json:"answers,omitempty"`
}

// PlanTaskItem represents a task dispatched from the phone.
type PlanTaskItem struct {
	Title  string `json:"title"`
	Prompt string `json:"prompt"`
	Cwd    string `json:"cwd,omitempty"`
	Model  string `json:"model,omitempty"`
}

// ServerMessage is sent from the orchestrator to the phone over WebSocket.
type ServerMessage struct {
	Type   string               `json:"type"` // "event", "agents", "status", "pong", "error"
	Event  *domain.RuntimeEvent `json:"event,omitempty"`
	Agents []RemoteAgentView    `json:"agents,omitempty"`
	Status *RemoteStatus        `json:"status,omitempty"`
	Error  string               `json:"error,omitempty"`
}

type RemoteStatus struct {
	Project       string `json:"project"`
	ActiveModel   string `json:"activeModel"`
	ActiveDriver  string `json:"activeDriver"`
	TotalAgents   int    `json:"totalAgents"`
	RunningAgents int    `json:"runningAgents"`
}

type RemoteAgentView struct {
	ThreadID   string           `json:"threadId"`
	Title      string           `json:"title"`
	Driver     string           `json:"driver"`
	Model      string           `json:"model"`
	State      domain.TaskState `json:"state"`
	Cwd        string           `json:"cwd"`
	ProjectCwd string           `json:"projectCwd,omitempty"`
	Branch     string           `json:"branch,omitempty"`
	Live       bool             `json:"live"`
}
