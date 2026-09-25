package antigravity

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"composer/internal/domain"
)

func toolFrame(t *testing.T, index int, state, name string, params map[string]any) *Envelope {
	t.Helper()
	raw, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	return &Envelope{Event: "step_update", StepUpdate: &StepUpdate{
		StepIndex: index, State: state, StepType: "tool", ToolName: name,
		ToolInfo: &ToolInfo{Name: name, Parameters: raw},
	}}
}

func lastTool(t *testing.T, events []domain.RuntimeEvent) *domain.ToolCall {
	t.Helper()
	if len(events) == 0 || events[len(events)-1].Tool == nil {
		t.Fatalf("no tool event in %v", events)
	}
	return events[len(events)-1].Tool
}

func TestEditAfterViewCarriesTrimmedDiff(t *testing.T) {
	a, s, captured := newTestAdapter()
	path := filepath.Join(t.TempDir(), "main.go")
	var lines []string
	for i := 0; i < 40; i++ {
		lines = append(lines, "line "+string(rune('a'+i%26)))
	}
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		t.Fatal(err)
	}
	params := map[string]any{"AbsolutePath": path}
	a.handleEnvelope(s, "turn-1", toolFrame(t, 1, StateActive, "view_file", params))
	a.handleEnvelope(s, "turn-1", toolFrame(t, 1, StateDone, "view_file", params))

	edit := map[string]any{"TargetFile": path}
	a.handleEnvelope(s, "turn-1", toolFrame(t, 2, StateActive, "replace_file_content", edit))
	lines[20] = "changed"
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		t.Fatal(err)
	}
	a.handleEnvelope(s, "turn-1", toolFrame(t, 2, StateDone, "replace_file_content", edit))

	tool := lastTool(t, *captured)
	if len(tool.Diffs) != 1 {
		t.Fatalf("want one diff, got %v", tool.Diffs)
	}
	diff := tool.Diffs[0]
	if !strings.Contains(diff.NewText, "changed") || strings.Contains(diff.OldText, "changed") {
		t.Errorf("diff does not show the change: %+v", diff)
	}
	if got := strings.Count(diff.NewText, "\n") + 1; got != 1+2*diffContextLines {
		t.Errorf("want the change plus %d context lines each side, got %d lines", diffContextLines, got)
	}
}

func TestNewFileDiffIsAllAdditions(t *testing.T) {
	a, s, captured := newTestAdapter()
	path := filepath.Join(t.TempDir(), "new.txt")
	edit := map[string]any{"TargetFile": path}
	a.handleEnvelope(s, "turn-1", toolFrame(t, 1, StateActive, "write_to_file", edit))
	if err := os.WriteFile(path, []byte("one\ntwo"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.handleEnvelope(s, "turn-1", toolFrame(t, 1, StateDone, "write_to_file", edit))

	tool := lastTool(t, *captured)
	if len(tool.Diffs) != 1 || tool.Diffs[0].OldText != "" || tool.Diffs[0].NewText != "one\ntwo" {
		t.Fatalf("want an all-additions diff, got %+v", tool.Diffs)
	}
}

func TestTaskPlumbingIsHidden(t *testing.T) {
	a, s, captured := newTestAdapter()
	a.handleEnvelope(s, "turn-1", toolFrame(t, 1, StateDone, "manage_task", map[string]any{"Action": "status"}))
	a.handleEnvelope(s, "turn-1", toolFrame(t, 2, StateDone, "schedule", map[string]any{"DurationSeconds": 8}))
	if len(*captured) != 0 {
		t.Fatalf("want no events, got %v", *captured)
	}
}
