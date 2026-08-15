package opencode

import (
	"encoding/json"

	"catalyst/internal/domain"
)

func (a *Adapter) handleEvent(event Event) {
	switch event.Type {
	case "message.part.updated":
		a.onPartUpdated(event.Properties)
	case "message.updated":
		a.onMessageUpdated(event.Properties)
	case "session.idle":
		a.onSessionIdle(event.Properties)
	case "session.error":
		a.onSessionError(event.Properties)
	case "permission.updated", "permission.asked":
		a.onPermission(event.Properties)
	}
}

func (a *Adapter) lookupBySession(sessionID string) *thread {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.bySession[sessionID]
}

func (a *Adapter) base(t *thread, kind domain.EventKind) domain.RuntimeEvent {
	t.mu.Lock()
	turnID := t.turnID
	t.mu.Unlock()
	return domain.RuntimeEvent{
		Kind: kind, ThreadID: t.threadID, TurnID: turnID, Driver: domain.DriverOpenCode,
	}
}

func (a *Adapter) onPartUpdated(raw json.RawMessage) {
	var props PartUpdatedProperties
	if json.Unmarshal(raw, &props) != nil {
		return
	}
	part := props.Part
	t := a.lookupBySession(part.SessionID)
	if t == nil {
		return
	}

	switch part.Type {
	case "text":
		if part.Text == "" {
			return
		}
		event := a.base(t, domain.EventAgentMessage)
		event.Text = part.Text
		a.emit.Emit(event)

	case "reasoning":
		if part.Text == "" {
			return
		}
		event := a.base(t, domain.EventAgentThought)
		event.Text = part.Text
		a.emit.Emit(event)

	case "tool":
		a.onToolPart(t, part)
	}
}

// onToolPart emits a call the first time a tool id is seen and results
// thereafter, so the UI gets a single lifecycle per invocation.
func (a *Adapter) onToolPart(t *thread, part Part) {
	if part.State == nil {
		return
	}
	id := part.CallID
	if id == "" {
		id = part.ID
	}

	tool := &domain.ToolCall{ID: id, Name: part.Tool, Status: mapToolStatus(part.State.Status)}
	if len(part.State.Input) > 0 {
		_ = json.Unmarshal(part.State.Input, &tool.Input)
	}
	tool.Output = part.State.Output
	if part.State.Error != "" {
		tool.Status = domain.ToolFailed
		tool.Output = part.State.Error
	}

	t.mu.Lock()
	seen := t.tools[id]
	t.tools[id] = part.State.Status
	t.mu.Unlock()

	kind := domain.EventToolResult
	if seen == "" {
		kind = domain.EventToolCall
	}
	event := a.base(t, kind)
	event.Tool = tool
	a.emit.Emit(event)
}

func mapToolStatus(status string) domain.ToolStatus {
	switch status {
	case "running":
		return domain.ToolInProgress
	case "completed":
		return domain.ToolCompleted
	case "error":
		return domain.ToolFailed
	default:
		return domain.ToolPending
	}
}

func (a *Adapter) onMessageUpdated(raw json.RawMessage) {
	var props MessageUpdatedProperties
	if json.Unmarshal(raw, &props) != nil {
		return
	}
	info := props.Info
	if info.Role != "assistant" || info.Tokens == nil {
		return
	}
	t := a.lookupBySession(info.SessionID)
	if t == nil {
		return
	}

	event := a.base(t, domain.EventUsage)
	event.Usage = &domain.Usage{
		InputTokens:      info.Tokens.Input,
		OutputTokens:     info.Tokens.Output,
		CacheReadTokens:  info.Tokens.Cache.Read,
		CacheWriteTokens: info.Tokens.Cache.Write,
		CostUSD:          info.Cost,
	}
	a.emit.Emit(event)
}

// onSessionIdle marks the end of a turn: OpenCode reports completion by going
// idle rather than by acknowledging the prompt call.
func (a *Adapter) onSessionIdle(raw json.RawMessage) {
	var props SessionIdleProperties
	if json.Unmarshal(raw, &props) != nil {
		return
	}
	t := a.lookupBySession(props.SessionID)
	if t == nil {
		return
	}

	t.mu.Lock()
	turnID := t.turnID
	t.turnID = ""
	t.tools = make(map[string]string)
	t.mu.Unlock()
	if turnID == "" {
		return
	}

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnCompleted, ThreadID: t.threadID, TurnID: turnID,
		Driver: domain.DriverOpenCode, StopReason: domain.StopEndTurn,
	})
}

func (a *Adapter) onSessionError(raw json.RawMessage) {
	var props SessionErrorProperties
	if json.Unmarshal(raw, &props) != nil {
		return
	}
	t := a.lookupBySession(props.SessionID)
	if t == nil {
		return
	}

	t.mu.Lock()
	turnID := t.turnID
	t.turnID = ""
	t.mu.Unlock()

	a.emit.Emit(domain.RuntimeEvent{
		Kind: domain.EventTurnFailed, ThreadID: t.threadID, TurnID: turnID,
		Driver: domain.DriverOpenCode, Error: string(props.Error),
	})
}

func (a *Adapter) onPermission(raw json.RawMessage) {
	var props PermissionProperties
	if json.Unmarshal(raw, &props) != nil || props.ID == "" {
		return
	}
	t := a.lookupBySession(props.SessionID)
	if t == nil {
		return
	}

	a.mu.Lock()
	a.pending[props.ID] = props.SessionID
	a.mu.Unlock()

	title := props.Title
	if title == "" {
		title = props.Type
	}

	event := a.base(t, domain.EventApprovalRequest)
	event.Approval = &domain.ApprovalRequest{
		RequestID: props.ID,
		Title:     title,
		Detail:    props.Pattern,
		Options: []domain.ApprovalOption{
			{ID: "once", Name: "Allow once", Kind: domain.ApprovalAllowOnce},
			{ID: "always", Name: "Always allow", Kind: domain.ApprovalAllowAlways},
			{ID: "reject", Name: "Deny", Kind: domain.ApprovalDeny},
		},
	}
	a.emit.Emit(event)
}
