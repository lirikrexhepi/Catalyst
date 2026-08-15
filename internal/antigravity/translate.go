package antigravity

import (
	"encoding/json"

	"catalyst/internal/domain"
)

// handleEnvelope converts one agy frame into canonical events.
func (a *Adapter) handleEnvelope(s *session, turnID string, envelope *Envelope) {
	if envelope.ConversationID != "" {
		s.mu.Lock()
		isNew := s.conversationID != envelope.ConversationID
		s.conversationID = envelope.ConversationID
		s.mu.Unlock()
		if isNew && envelope.Event == "init" {
			a.emit.Emit(domain.RuntimeEvent{
				Kind: domain.EventSessionStarted, ThreadID: s.threadID, TurnID: turnID,
				Driver: domain.DriverAntigravity, Text: envelope.ConversationID,
			})
		}
	}

	switch envelope.Event {
	case "step_update":
		a.handleStep(s, turnID, envelope.StepUpdate)
	case "result":
		a.handleResult(s, turnID, envelope.Result)
	}
}

func (a *Adapter) event(s *session, turnID string, kind domain.EventKind) domain.RuntimeEvent {
	return domain.RuntimeEvent{
		Kind: kind, ThreadID: s.threadID, TurnID: turnID, Driver: domain.DriverAntigravity,
	}
}

func (a *Adapter) handleStep(s *session, turnID string, step *StepUpdate) {
	if step == nil {
		return
	}

	switch step.StepType {
	case "agent_response":
		if step.TextDelta != "" {
			event := a.event(s, turnID, domain.EventAgentMessage)
			event.Text = step.TextDelta
			event.Delta = true
			a.emit.Emit(event)
		}
	case "thinking", "reasoning":
		if step.TextDelta != "" {
			event := a.event(s, turnID, domain.EventAgentThought)
			event.Text = step.TextDelta
			event.Delta = true
			a.emit.Emit(event)
		}
	case "tool":
		a.handleTool(s, turnID, step)
	}

	if step.Usage != nil {
		event := a.event(s, turnID, domain.EventUsage)
		event.Usage = convertUsage(step.Usage)
		a.emit.Emit(event)
	}
}

// handleTool emits a call on the first sighting of a step index and a result on
// its terminal update, so each invocation produces one lifecycle.
func (a *Adapter) handleTool(s *session, turnID string, step *StepUpdate) {
	s.mu.Lock()
	seen := s.tools[step.StepIndex]
	s.tools[step.StepIndex] = step.State
	s.mu.Unlock()

	tool := &domain.ToolCall{
		ID:     toolID(step),
		Name:   step.ToolName,
		Status: mapState(step.State),
	}
	if step.ToolInfo != nil {
		if len(step.ToolInfo.Parameters) > 0 {
			_ = json.Unmarshal(step.ToolInfo.Parameters, &tool.Input)
		}
		tool.Output = step.ToolInfo.Output
		if step.ToolInfo.Error != "" {
			tool.Output = step.ToolInfo.Error
			tool.Status = domain.ToolFailed
		}
	}

	kind := domain.EventToolResult
	if seen == "" {
		kind = domain.EventToolCall
	}
	event := a.event(s, turnID, kind)
	event.Tool = tool
	a.emit.Emit(event)
}

func toolID(step *StepUpdate) string {
	return step.ToolName + ":" + itoa(step.StepIndex)
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	var digits []byte
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

func mapState(state string) domain.ToolStatus {
	switch state {
	case StateActive:
		return domain.ToolInProgress
	case StateDone:
		return domain.ToolCompleted
	case StateError:
		return domain.ToolFailed
	default:
		return domain.ToolPending
	}
}

func (a *Adapter) handleResult(s *session, turnID string, result *Result) {
	if result == nil {
		a.emit.Emit(a.event(s, turnID, domain.EventTurnCompleted))
		return
	}

	if result.Usage != nil {
		event := a.event(s, turnID, domain.EventUsage)
		event.Usage = convertUsage(result.Usage)
		a.emit.Emit(event)
	}

	if result.Status != "SUCCESS" {
		event := a.event(s, turnID, domain.EventTurnFailed)
		event.Error = firstNonEmpty(result.Error, result.Status)
		a.emit.Emit(event)
		return
	}

	event := a.event(s, turnID, domain.EventTurnCompleted)
	event.StopReason = domain.StopEndTurn
	a.emit.Emit(event)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func convertUsage(usage *Usage) *domain.Usage {
	return &domain.Usage{
		InputTokens:     usage.InputTokens,
		OutputTokens:    usage.OutputTokens,
		CacheReadTokens: usage.CacheReadTokens,
	}
}
