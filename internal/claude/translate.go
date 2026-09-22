package claude

import (
	"context"
	"encoding/json"
	"strings"

	"composer/internal/domain"
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
	case "control_request":
		a.handleControlRequest(s, envelope)
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
			tool := &domain.ToolCall{ID: block.ID, Name: block.Name, Status: domain.ToolInProgress}
			if len(block.Input) > 0 {
				_ = json.Unmarshal(block.Input, &tool.Input)
			}
			// Intercept AskUserQuestion to render the interactive question card
			if block.Name == "AskUserQuestion" {
				event := a.event(s, domain.EventQuestionAsked)
				event.Question = parseClaudeQuestion(block.ID, tool.Input)
				a.emit.Emit(event)
				continue
			}
			event := a.event(s, domain.EventToolCall)
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

func (a *Adapter) handleControlRequest(s *session, envelope *Envelope) {
	reqID := envelope.RequestID
	if reqID == "" {
		return
	}

	payload := envelope.Request
	toolName := "Permission Request"
	detail := ""
	if payload != nil {
		if payload.ToolName != "" {
			toolName = payload.ToolName
		}
		if len(payload.Input) > 0 {
			detail = string(payload.Input)
		}
	}

	s.mu.Lock()
	perm := s.permission
	s.mu.Unlock()

	// If bypassPermissions is configured, auto-approve immediately
	if perm == domain.PermissionBypass {
		go func() {
			_ = a.RespondToApproval(context.Background(), s.threadID, reqID, domain.ApprovalAllowAlways)
		}()
		return
	}

	event := a.event(s, domain.EventApprovalRequest)
	event.Approval = &domain.ApprovalRequest{
		RequestID: reqID,
		Title:     toolName,
		Detail:    detail,
		Options: []domain.ApprovalOption{
			{ID: "once", Name: "Allow once", Kind: domain.ApprovalAllowOnce},
			{ID: "always", Name: "Always allow", Kind: domain.ApprovalAllowAlways},
			{ID: "reject", Name: "Deny", Kind: domain.ApprovalDeny},
		},
	}
	a.emit.Emit(event)
}

func parseClaudeQuestion(requestID string, input map[string]any) *domain.QuestionRequest {
	req := &domain.QuestionRequest{RequestID: requestID}
	if rawQuestions, ok := input["questions"].([]any); ok && len(rawQuestions) > 0 {
		for _, entry := range rawQuestions {
			m, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			item := domain.QuestionItem{}
			if q, ok := m["question"].(string); ok && q != "" {
				item.Question = q
			} else if h, ok := m["header"].(string); ok && h != "" {
				item.Question = h
			}
			if h, ok := m["header"].(string); ok && h != "" {
				if q, ok := m["question"].(string); ok && q != "" && q != h {
					item.Question = h + ": " + q
				}
			}
			if opts, ok := m["options"].([]any); ok {
				item.Options = formatClaudeOptions(opts)
			}
			if item.Question != "" {
				req.Questions = append(req.Questions, item)
			}
		}
		if len(req.Questions) > 0 {
			return req
		}
	}
	item := domain.QuestionItem{}
	if q, ok := input["question"].(string); ok && q != "" {
		item.Question = q
	} else if h, ok := input["header"].(string); ok && h != "" {
		item.Question = h
	}
	if opts, ok := input["options"].([]any); ok {
		item.Options = formatClaudeOptions(opts)
	}
	if item.Question != "" {
		req.Questions = []domain.QuestionItem{item}
	}
	return req
}

func formatClaudeOptions(opts []any) []string {
	out := make([]string, 0, len(opts))
	for _, o := range opts {
		switch v := o.(type) {
		case string:
			if v != "" {
				out = append(out, v)
			}
		case map[string]any:
			label := ""
			if s, ok := v["label"].(string); ok && s != "" {
				label = s
			} else if s, ok := v["value"].(string); ok && s != "" {
				label = s
			}
			if d, ok := v["description"].(string); ok && d != "" {
				if label != "" {
					label = label + " — " + d
				} else {
					label = d
				}
			}
			if label != "" {
				out = append(out, label)
			}
		}
	}
	return out
}
