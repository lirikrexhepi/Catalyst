package claudeimport

import (
	"os"
	"path/filepath"
	"testing"

	"composer/internal/domain"
)

func writeSample(t *testing.T) string {
	t.Helper()
	lines := []string{
		`{"type":"queue-operation","operation":"enqueue","timestamp":"2026-09-20T10:00:00.000Z","sessionId":"sess-1"}`,
		`{"type":"ai-title","aiTitle":"Fix login bug","sessionId":"sess-1"}`,
		`{"parentUuid":"00000000-0000-0000-0000-000000000000","isSidechain":false,"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix the login bug on the settings page"}]},"uuid":"u1","timestamp":"2026-09-20T10:00:01.000Z","cwd":"C:\\work\\app","sessionId":"sess-1","version":"2.1.0"}`,
		`{"parentUuid":"u1","isSidechain":false,"type":"assistant","message":{"model":"claude-opus-4-6","id":"m1","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"I should look at the settings page first."},{"type":"text","text":"I will look at the settings page."},{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"settings.tsx"}}]},"uuid":"a1","timestamp":"2026-09-20T10:00:05.000Z","sessionId":"sess-1"}`,
		`{"parentUuid":"a1","isSidechain":false,"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_1","type":"tool_result","content":"export function Settings() {}"}]},"uuid":"u2","timestamp":"2026-09-20T10:00:06.000Z","sessionId":"sess-1"}`,
		`{"parentUuid":"u2","isSidechain":true,"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"subagent internals"}]},"uuid":"a-side","timestamp":"2026-09-20T10:00:07.000Z","sessionId":"sess-1"}`,
		`{"parentUuid":"u2","isSidechain":false,"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Found it, the handler is missing."}],"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":5,"cache_creation_input_tokens":10}},"uuid":"a2","timestamp":"2026-09-20T10:00:08.000Z","sessionId":"sess-1"}`,
		`{"type":"attachment","sessionId":"sess-1"}`,
	}
	path := filepath.Join(t.TempDir(), "sess-1.jsonl")
	payload := ""
	for _, line := range lines {
		payload += line + "\n"
	}
	if err := os.WriteFile(path, []byte(payload), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestParseFileConvertsConversation(t *testing.T) {
	parsed, err := ParseFile(writeSample(t))
	if err != nil {
		t.Fatalf("ParseFile: %v", err)
	}
	if parsed.SessionID != "sess-1" {
		t.Fatalf("session id = %q", parsed.SessionID)
	}
	if parsed.Title != "Fix login bug" {
		t.Fatalf("title = %q", parsed.Title)
	}
	if parsed.Cwd != `C:\work\app` {
		t.Fatalf("cwd = %q", parsed.Cwd)
	}
	if parsed.Model != "claude-opus-4-6" {
		t.Fatalf("model = %q", parsed.Model)
	}
	kinds := map[domain.EventKind]int{}
	for _, event := range parsed.Events {
		kinds[event.Kind]++
		if event.Driver != domain.DriverClaude {
			t.Fatalf("event driver = %q", event.Driver)
		}
		if event.At == 0 {
			t.Fatalf("event missing timestamp: %+v", event)
		}
	}
	if kinds[domain.EventUserMessage] != 1 {
		t.Fatalf("user messages = %d: %+v", kinds[domain.EventUserMessage], kinds)
	}
	if kinds[domain.EventAgentMessage] != 2 {
		t.Fatalf("agent messages = %d: %+v", kinds[domain.EventAgentMessage], kinds)
	}
	if kinds[domain.EventAgentThought] != 1 {
		t.Fatalf("thoughts = %d: %+v", kinds[domain.EventAgentThought], kinds)
	}
	if kinds[domain.EventToolCall] != 1 {
		t.Fatalf("tool calls = %d: %+v", kinds[domain.EventToolCall], kinds)
	}
	if kinds[domain.EventToolResult] != 1 {
		t.Fatalf("tool results = %d: %+v", kinds[domain.EventToolResult], kinds)
	}
	if kinds[domain.EventUsage] != 1 {
		t.Fatalf("usage = %d: %+v", kinds[domain.EventUsage], kinds)
	}
	for _, event := range parsed.Events {
		if event.Kind == domain.EventAgentMessage && event.Text == "subagent internals" {
			t.Fatalf("sidechain record was not skipped")
		}
	}
	var last uint64
	for _, event := range parsed.Events {
		if event.Seq != last+1 {
			t.Fatalf("seq not contiguous: %+v", parsed.Events)
		}
		last = event.Seq
	}
}

func TestListFindsSampleSession(t *testing.T) {
	dir := t.TempDir()
	projects := filepath.Join(dir, "projects", "proj")
	if err := os.MkdirAll(projects, 0o755); err != nil {
		t.Fatal(err)
	}
	payload := "{\"parentUuid\":\"x\",\"isSidechain\":false,\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hello\"},\"uuid\":\"u1\",\"timestamp\":\"2026-09-20T10:00:01.000Z\",\"cwd\":\"C:\\\\w\",\"sessionId\":\"s-9\"}\n"
	if err := os.WriteFile(filepath.Join(projects, "s-9.jsonl"), []byte(payload), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CLAUDE_CONFIG_DIR", dir)
	sessions, err := List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions = %+v", sessions)
	}
	if sessions[0].ID != "s-9" || sessions[0].Title != "hello" {
		t.Fatalf("session = %+v", sessions[0])
	}
}
