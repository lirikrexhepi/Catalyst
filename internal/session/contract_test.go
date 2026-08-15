package session

import (
	"encoding/json"
	"strings"
	"testing"

	"catalyst/internal/domain"
)

// TestEventJSONContract locks the wire shape the frontend reducer switches on.
// A rename here silently breaks the UI, since Wails marshals these structs
// directly onto the event channel.
func TestEventJSONContract(t *testing.T) {
	event := domain.RuntimeEvent{
		Kind: domain.EventToolCall, ThreadID: CoordinatorThreadID, TurnID: "turn-1",
		Driver: domain.DriverClaude, Seq: 7, At: 1,
		Tool: &domain.ToolCall{
			ID: "t1", Name: "Bash", Status: domain.ToolInProgress,
			Input: map[string]any{"command": "ls"},
			Diffs: []domain.FileDiff{{Path: "a.go", NewText: "x"}},
		},
	}

	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}

	for _, field := range []string{
		`"kind":"tool.call"`, `"threadId":"coordinator"`, `"turnId":"turn-1"`,
		`"seq":7`, `"tool":{`, `"status":"in_progress"`, `"input":{"command":"ls"}`,
		`"diffs":[{"path":"a.go"`,
	} {
		if !strings.Contains(string(encoded), field) {
			t.Errorf("missing %s in %s", field, encoded)
		}
	}
}

// TestEventKindsMatchReducer keeps the Go constants aligned with the strings the
// TypeScript reducer cases on.
func TestEventKindsMatchReducer(t *testing.T) {
	expected := map[domain.EventKind]string{
		domain.EventAgentMessage:  "agent.message",
		domain.EventAgentThought:  "agent.thought",
		domain.EventToolCall:      "tool.call",
		domain.EventToolResult:    "tool.result",
		domain.EventPlan:          "plan",
		domain.EventTurnStarted:   "turn.started",
		domain.EventTurnCompleted: "turn.completed",
		domain.EventTurnFailed:    "turn.failed",
	}
	for kind, want := range expected {
		if string(kind) != want {
			t.Errorf("event kind drift: got %q want %q", kind, want)
		}
	}
}

func TestModelOptionsRoundTrip(t *testing.T) {
	var options domain.ModelOptions
	raw := `{"effort":"high","thinking":true,"contextWindow":"1m"}`
	if err := json.Unmarshal([]byte(raw), &options); err != nil {
		t.Fatal(err)
	}

	if got := options.String(domain.OptionEffort); got != "high" {
		t.Errorf("effort = %q", got)
	}
	if !options.Bool(domain.OptionThinking) {
		t.Error("thinking should be true")
	}
	if got := options.String(domain.OptionContextWindow); got != "1m" {
		t.Errorf("contextWindow = %q", got)
	}
}
