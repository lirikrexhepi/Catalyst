package claude

import (
	"encoding/json"
	"strings"

	"catalyst/internal/domain"
)

func (a *Adapter) handleEnvelope(s *session, envelope *Envelope) {
	if envelope.SessionID != "" {
		s.mu.Lock()
		s.sessionID = envelope.SessionID
		s.mu.Unlock()
	}

	switch envelope.Type {
	case "system":
		if envelope.Subtype == "init" {
			event := a.event(s, domain.EventSessionStarted)
			event.Text = s.providerSessionID()
			a.emit.Emit(event)
		}
	case "assistant":
		a.handleAssistant(s, envelope)
	case "user":
		a.handleToolResults(s, envelope)
	case "result":
		a.handleResult(s, envelope)
	case "rate_limit_event":
		a.handleRateLimit(s, envelope)
	}
}

// handleRateLimit forwards subscription quota. The CLI reports one window per
// frame, so windows are emitted individually and merged downstream rather than
// assumed to arrive together.
func (a *Adapter) handleRateLimit(s *session, envelope *Envelope) {
	info := envelope.RateLimitInfo
	if info == nil || info.RateLimitType == "" {
		return
	}

	limit := domain.RateLimit{
		Window:      info.RateLimitType,
		Status:      info.Status,
		ResetsAt:    info.ResetsAt,
		UsedPercent: info.UsedPercent,
	}
	// Some builds report headroom instead of consumption; normalise to used.
	if limit.UsedPercent == nil && info.RemainingPct != nil {
		used := 100 - *info.RemainingPct
		limit.UsedPercent = &used
	}

	event := a.event(s, domain.EventRateLimit)
	event.RateLimits = []domain.RateLimit{limit}
	a.emit.Emit(event)
}

func (a *Adapter) event(s *session, kind domain.EventKind) domain.RuntimeEvent {
	s.mu.Lock()
	turnID := s.turnID
	s.mu.Unlock()
	return domain.RuntimeEvent{Kind: kind, ThreadID: s.threadID, TurnID: turnID, Driver: domain.DriverClaude}
}

func (a *Adapter) handleAssistant(s *session, envelope *Envelope) {
	if envelope.Message == nil {
		return
	}

	for _, block := range envelope.Message.Content {
		switch block.Type {
		case "text":
			if block.Text == "" {
				continue
			}
			event := a.event(s, domain.EventAgentMessage)
			event.Text = block.Text
			a.emit.Emit(event)
		case "thinking":
			if block.Thinking == "" {
				continue
			}
			event := a.event(s, domain.EventAgentThought)
			event.Text = block.Thinking
			a.emit.Emit(event)
		case "tool_use":
			event := a.event(s, domain.EventToolCall)
			tool := &domain.ToolCall{ID: block.ID, Name: block.Name, Status: domain.ToolInProgress}
			if len(block.Input) > 0 {
				_ = json.Unmarshal(block.Input, &tool.Input)
			}
			event.Tool = tool
			a.emit.Emit(event)
		}
	}

	if envelope.Message.Usage != nil {
		event := a.event(s, domain.EventUsage)
		event.Usage = convertUsage(envelope.Message.Usage, 0)
		a.emit.Emit(event)
	}
}

func (a *Adapter) handleToolResults(s *session, envelope *Envelope) {
	if envelope.Message == nil {
		return
	}
	for _, block := range envelope.Message.Content {
		if block.Type != "tool_result" {
			continue
		}
		status := domain.ToolCompleted
		if block.IsError {
			status = domain.ToolFailed
		}
		event := a.event(s, domain.EventToolResult)
		event.Tool = &domain.ToolCall{
			ID:     block.ToolUseID,
			Status: status,
			Output: flattenContent(block.Content),
		}
		a.emit.Emit(event)
	}
}

// flattenContent renders a tool_result payload, which is either a bare string
// or an array of content blocks depending on the tool.
func flattenContent(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}

	var blocks []ContentBlock
	if json.Unmarshal(raw, &blocks) != nil {
		return string(raw)
	}
	var builder strings.Builder
	for _, block := range blocks {
		builder.WriteString(block.Text)
	}
	return builder.String()
}

func (a *Adapter) handleResult(s *session, envelope *Envelope) {
	s.mu.Lock()
	turnID := s.turnID
	s.turnID = ""
	s.mu.Unlock()

	if envelope.Usage != nil {
		a.emit.Emit(domain.RuntimeEvent{
			Kind: domain.EventUsage, ThreadID: s.threadID, TurnID: turnID, Driver: domain.DriverClaude,
			Usage: convertUsage(envelope.Usage, envelope.TotalCost),
		})
	}

	event := domain.RuntimeEvent{ThreadID: s.threadID, TurnID: turnID, Driver: domain.DriverClaude}
	if envelope.IsError {
		event.Kind = domain.EventTurnFailed
		event.Error = envelope.Result
		if event.Error == "" {
			event.Error = envelope.Subtype
		}
	} else {
		event.Kind = domain.EventTurnCompleted
		event.StopReason = mapStopReason(envelope.StopReason, envelope.Subtype)
	}
	a.emit.Emit(event)
}

func mapStopReason(stopReason, subtype string) domain.StopReason {
	switch stopReason {
	case "max_tokens":
		return domain.StopMaxTokens
	case "refusal":
		return domain.StopRefusal
	}
	switch subtype {
	case "error_max_turns", "error_during_execution":
		return domain.StopError
	}
	return domain.StopEndTurn
}

func convertUsage(usage *Usage, cost float64) *domain.Usage {
	return &domain.Usage{
		InputTokens:      usage.InputTokens,
		OutputTokens:     usage.OutputTokens,
		CacheReadTokens:  usage.CacheReadInputTokens,
		CacheWriteTokens: usage.CacheCreationInputTokens,
		CostUSD:          cost,
	}
}
