package session

import "testing"

func TestTurnNoteIsTakenOnce(t *testing.T) {
	var notes TurnNotes
	notes.Queue("t1", func() string { return "server is up" })
	if got := notes.take("t2"); got != "" {
		t.Fatalf("other thread got %q", got)
	}
	if got := notes.take("t1"); got != "server is up" {
		t.Fatalf("first take = %q", got)
	}
	if got := notes.take("t1"); got != "" {
		t.Fatalf("second take = %q, want empty", got)
	}
}

func TestTurnNoteCanWithdrawItself(t *testing.T) {
	var notes TurnNotes
	notes.Queue("t1", func() string { return "" })
	if got := notes.take("t1"); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}
