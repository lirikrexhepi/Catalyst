package session

import (
	"strings"
	"testing"

	"composer/internal/domain"
)

func TestExtractMergesDeltaReplies(t *testing.T) {
	events := []domain.RuntimeEvent{
		{Kind: domain.EventUserMessage, TurnID: "t1", Text: "remember ESPERANSA"},
		{Kind: domain.EventAgentMessage, TurnID: "t1", Text: "Understood! I'll remember ", Delta: true},
		{Kind: domain.EventAgentMessage, TurnID: "t1", Text: "the word.", Delta: true},
		{Kind: domain.EventTurnCompleted, TurnID: "t1"},
	}
	got := ExtractConversationText(events, 0)
	if !strings.Contains(got, "ESPERANSA") {
		t.Errorf("user text missing: %q", got)
	}
	if !strings.Contains(got, "Understood! I'll remember the word.") {
		t.Errorf("merged deltas missing: %q", got)
	}
}

func TestExtractSkipsEchoedFinalFrame(t *testing.T) {
	events := []domain.RuntimeEvent{
		{Kind: domain.EventAgentMessage, TurnID: "t1", Text: "HELLO", Delta: true},
		{Kind: domain.EventAgentMessage, TurnID: "t1", Text: "HELLO"},
		{Kind: domain.EventTurnCompleted, TurnID: "t1"},
	}
	got := ExtractConversationText(events, 0)
	if count := strings.Count(got, "HELLO"); count != 1 {
		t.Errorf("echo duplicated %d times: %q", count, got)
	}
}

func TestExtractKeepsDistinctFinalResponse(t *testing.T) {
	events := []domain.RuntimeEvent{
		{Kind: domain.EventAgentMessage, TurnID: "t1", Text: "Working on it...", Delta: true},
		{Kind: domain.EventAgentMessage, TurnID: "t1", Text: "Done: fixed the bug."},
		{Kind: domain.EventTurnCompleted, TurnID: "t1"},
	}
	got := ExtractConversationText(events, 0)
	if !strings.Contains(got, "Working on it...") || !strings.Contains(got, "Done: fixed the bug.") {
		t.Errorf("distinct texts lost: %q", got)
	}
}
