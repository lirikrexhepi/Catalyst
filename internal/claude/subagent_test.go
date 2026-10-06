package claude

import (
	"testing"

	"composer/internal/domain"
)

func TestSubagentFramesCarryTheirParentToolID(t *testing.T) {
	emit := &captureEmitter{}
	a := NewAdapter(domain.ProviderSettings{}, emit)
	s := newContextSession()

	feed(t, a, s,
		`{"type":"assistant","parent_tool_use_id":"toolu_task","uuid":"u1","message":{"id":"m1","content":[{"type":"text","text":"looking"},{"type":"tool_use","id":"toolu_read","name":"Read","input":{"file_path":"a.go"}}]}}`,
		`{"type":"user","parent_tool_use_id":"toolu_task","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_read","content":"package a"}]}}`,
	)

	want := []domain.EventKind{domain.EventSubagentMessage, domain.EventSubagentToolCall, domain.EventSubagentToolDone}
	if len(emit.events) != len(want) {
		t.Fatalf("got %d events, want %d", len(emit.events), len(want))
	}
	for i, kind := range want {
		if emit.events[i].Kind != kind || emit.events[i].ParentToolID != "toolu_task" {
			t.Fatalf("event %d = %s parent=%q, want %s parent=toolu_task", i, emit.events[i].Kind, emit.events[i].ParentToolID, kind)
		}
	}
}
