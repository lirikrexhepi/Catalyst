package claude

import (
	"encoding/json"
	"strings"
	"testing"

	"composer/internal/domain"
)

type captureEmitter struct{ events []domain.RuntimeEvent }

func (c *captureEmitter) Emit(e domain.RuntimeEvent) { c.events = append(c.events, e) }

func (c *captureEmitter) usages() []*domain.Usage {
	var out []*domain.Usage
	for _, e := range c.events {
		if e.Kind == domain.EventUsage {
			out = append(out, e.Usage)
		}
	}
	return out
}

func feed(t *testing.T, a *Adapter, s *session, frames ...string) {
	t.Helper()
	for _, frame := range frames {
		var envelope Envelope
		if err := json.Unmarshal([]byte(frame), &envelope); err != nil {
			t.Fatalf("unmarshal %s: %v", frame, err)
		}
		a.handleEnvelope(s, &envelope)
	}
}

func newContextSession() *session {
	return &session{
		threadID:     "t1",
		model:        "claude-opus-5",
		streamedMsgs: make(map[string]bool),
		hiddenTools:  make(map[string]bool),
		pending:      make(map[string]*pendingControl),
	}
}

func TestContextUsageFollowsTheLatestCallAndTheReportedWindow(t *testing.T) {
	emit := &captureEmitter{}
	a := NewAdapter(domain.ProviderSettings{}, emit)
	s := newContextSession()

	feed(t, a, s,
		`{"type":"system","subtype":"init","model":"claude-opus-5[1m]","session_id":"x"}`,
		`{"type":"assistant","message":{"id":"m1","content":[],"usage":{"input_tokens":2,"cache_creation_input_tokens":39203,"cache_read_input_tokens":100,"output_tokens":5}}}`,
		`{"type":"assistant","message":{"id":"m2","parent_tool_use_id":"","content":[],"usage":{"input_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":41000,"output_tokens":20}}}`,
		`{"type":"assistant","parent_tool_use_id":"toolu_sub","message":{"id":"m3","content":[],"usage":{"input_tokens":1,"cache_read_input_tokens":900000,"output_tokens":1}}}`,
		`{"type":"result","subtype":"success","usage":{"input_tokens":5,"cache_creation_input_tokens":39203,"cache_read_input_tokens":41100,"output_tokens":25},"modelUsage":{"claude-opus-5[1m]":{"contextWindow":1000000}}}`,
	)

	usages := emit.usages()
	if len(usages) != 3 {
		t.Fatalf("want 3 usage events (two calls and the result), got %d", len(usages))
	}
	if got := usages[0].ContextTokens; got != 2+39203+100+5 {
		t.Errorf("first call context = %d", got)
	}
	if got := usages[1].ContextTokens; got != 3+41000+20 {
		t.Errorf("second call context = %d", got)
	}
	if usages[0].ContextWindow != 1_000_000 {
		t.Errorf("window from [1m] model = %d, want 1000000", usages[0].ContextWindow)
	}
	if usages[2].ContextTokens != 0 {
		t.Errorf("turn totals must not be read as context, got %d", usages[2].ContextTokens)
	}
	if usages[2].ContextWindow != 1_000_000 {
		t.Errorf("result window = %d", usages[2].ContextWindow)
	}
}

func TestDefaultWindowWithoutExtendedContext(t *testing.T) {
	s := newContextSession()
	if got := s.contextLimit(); got != 200_000 {
		t.Fatalf("got %d, want 200000", got)
	}
	s.options = domain.ModelOptions{domain.OptionContextWindow: "1m"}
	if got := s.contextLimit(); got != 1_000_000 {
		t.Fatalf("got %d with the 1m option, want 1000000", got)
	}
}

func TestLaunchRequestsThinkingSummaries(t *testing.T) {
	a := NewAdapter(domain.ProviderSettings{}, &captureEmitter{})
	args := strings.Join(a.buildArgs(domain.SessionStartInput{Model: "claude-opus-5"}), "\x00")
	for _, want := range []string{"--thinking-display\x00summarized", `"showThinkingSummaries":true`} {
		if !strings.Contains(args, want) {
			t.Errorf("args missing %q", strings.ReplaceAll(want, "\x00", " "))
		}
	}

	off := strings.Join(a.buildArgs(domain.SessionStartInput{Model: "claude-opus-5", Options: domain.ModelOptions{domain.OptionThinking: false}}), "\x00")
	if strings.Contains(off, "--thinking-display") || strings.Contains(off, "showThinkingSummaries") {
		t.Errorf("thinking turned off must not request summaries: %s", strings.ReplaceAll(off, "\x00", " "))
	}
	if strings.Contains(args, "--append-system-prompt") {
		t.Error("Claude narrates on its own and must not get the runtime note")
	}
}
