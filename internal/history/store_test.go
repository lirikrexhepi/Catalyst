package history

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"catalyst/internal/domain"
)

func event(threadID, text string, seq uint64) domain.RuntimeEvent {
	return domain.RuntimeEvent{
		Kind:     domain.EventAgentMessage,
		ThreadID: threadID,
		Text:     text,
		Seq:      seq,
		At:       1700000000000,
	}
}

func TestRoundTripKeepsOrchestratorAndAgentsTogether(t *testing.T) {
	store := New(t.TempDir())
	defer store.Close()

	meta := Meta{
		Workspace:           domain.Workspace{ID: "ws-1", Title: "Fix parcels", UpdatedAt: 20},
		CoordinatorThreadID: "coordinator-ws-1",
		Tasks: []domain.Task{
			{ID: "t-1", WorkspaceID: "ws-1", ThreadID: "thread-a", Title: "PHA-1015"},
			{ID: "t-2", WorkspaceID: "ws-1", ThreadID: "thread-b", Title: "PHA-1016"},
		},
		Resume: map[string]string{"thread-a": "claude-sess-1"},
	}
	if err := store.SaveMeta(meta); err != nil {
		t.Fatalf("SaveMeta: %v", err)
	}

	// The orchestrator and both agents record onto the same workspace.
	if err := store.Append("ws-1", "coordinator-ws-1", event("coordinator-ws-1", "plan", 1)); err != nil {
		t.Fatalf("append coordinator: %v", err)
	}
	for i, thread := range []string{"thread-a", "thread-b"} {
		if err := store.Append("ws-1", thread, event(thread, "work", uint64(i+2))); err != nil {
			t.Fatalf("append %s: %v", thread, err)
		}
	}

	loaded, err := store.Load("ws-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	// The whole point of the feature: one load yields the orchestrator plus
	// every agent it spawned, not a single thread.
	if got := len(loaded.Transcripts); got != 3 {
		t.Fatalf("expected 3 transcripts (orchestrator + 2 agents), got %d", got)
	}
	if loaded.Meta.CoordinatorThreadID != "coordinator-ws-1" {
		t.Errorf("coordinator thread id lost: %q", loaded.Meta.CoordinatorThreadID)
	}
	if got := loaded.Transcripts["coordinator-ws-1"]; len(got) != 1 || got[0].Text != "plan" {
		t.Errorf("orchestrator transcript not restored: %+v", got)
	}
	if loaded.Meta.Resume["thread-a"] != "claude-sess-1" {
		t.Errorf("resume id lost: %+v", loaded.Meta.Resume)
	}
	if len(loaded.Meta.Tasks) != 2 {
		t.Errorf("expected 2 tasks, got %d", len(loaded.Meta.Tasks))
	}
}

func TestLoadSeesEventsBufferedInSameRun(t *testing.T) {
	store := New(t.TempDir())
	defer store.Close()

	if err := store.SaveMeta(Meta{Workspace: domain.Workspace{ID: "ws-1"}}); err != nil {
		t.Fatalf("SaveMeta: %v", err)
	}
	// Deliberately no Flush: reopening a session in the run that created it must
	// not depend on the buffer having filled.
	if err := store.Append("ws-1", "thread-a", event("thread-a", "hello", 1)); err != nil {
		t.Fatalf("Append: %v", err)
	}

	loaded, err := store.Load("ws-1")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := loaded.Transcripts["thread-a"]; len(got) != 1 {
		t.Fatalf("buffered event not visible to Load, got %d events", len(got))
	}
}

func TestTruncatedFinalLineIsRecovered(t *testing.T) {
	root := t.TempDir()
	store := New(root)
	if err := store.SaveMeta(Meta{Workspace: domain.Workspace{ID: "ws-1"}}); err != nil {
		t.Fatalf("SaveMeta: %v", err)
	}
	if err := store.Append("ws-1", "thread-a", event("thread-a", "first", 1)); err != nil {
		t.Fatalf("Append: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Simulate a crash mid-write: a valid line followed by a partial one.
	path := filepath.Join(root, "ws-1", "thread-a.jsonl")
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := file.WriteString(`{"kind":"agent.message","tex`); err != nil {
		t.Fatalf("write partial: %v", err)
	}
	file.Close()

	reopened := New(root)
	defer reopened.Close()
	loaded, err := reopened.Load("ws-1")
	if err != nil {
		t.Fatalf("Load after crash: %v", err)
	}
	if got := loaded.Transcripts["thread-a"]; len(got) != 1 || got[0].Text != "first" {
		t.Fatalf("complete events should survive a truncated tail, got %+v", got)
	}
}

func TestListIsNewestFirstAndSkipsBrokenWorkspaces(t *testing.T) {
	root := t.TempDir()
	store := New(root)
	defer store.Close()

	for _, ws := range []domain.Workspace{
		{ID: "ws-old", Title: "older", UpdatedAt: 10},
		{ID: "ws-new", Title: "newer", UpdatedAt: 99},
	} {
		if err := store.SaveMeta(Meta{Workspace: ws}); err != nil {
			t.Fatalf("SaveMeta: %v", err)
		}
	}
	// A directory from a crashed write, with no readable metadata.
	if err := os.MkdirAll(filepath.Join(root, "ws-broken"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	list, err := store.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected the broken workspace to be skipped, got %d entries", len(list))
	}
	if list[0].Workspace.ID != "ws-new" {
		t.Errorf("expected newest first, got %q", list[0].Workspace.ID)
	}
}

func TestDeleteRemovesEverything(t *testing.T) {
	root := t.TempDir()
	store := New(root)
	defer store.Close()

	if err := store.SaveMeta(Meta{Workspace: domain.Workspace{ID: "ws-1"}}); err != nil {
		t.Fatalf("SaveMeta: %v", err)
	}
	if err := store.Append("ws-1", "thread-a", event("thread-a", "x", 1)); err != nil {
		t.Fatalf("Append: %v", err)
	}
	if err := store.Delete("ws-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := os.Stat(filepath.Join(root, "ws-1")); !os.IsNotExist(err) {
		t.Fatalf("workspace directory should be gone, stat err = %v", err)
	}
	// Appending after a delete must not resurrect a half-formed workspace that
	// List would then surface without metadata.
	if list, _ := store.List(); len(list) != 0 {
		t.Fatalf("expected empty history, got %d", len(list))
	}
}

func TestSafeNameRejectsPathEscape(t *testing.T) {
	cases := map[string]string{
		"../../etc/passwd": "______etc_passwd",
		"ws-1":             "ws-1",
		"thread/a":         "thread_a",
		"":                 "_",
	}
	for input, want := range cases {
		if got := safeName(input); got != want {
			t.Errorf("safeName(%q) = %q, want %q", input, got, want)
		}
	}

	// The property that actually matters: no result can escape its directory.
	for _, input := range []string{"../../etc/passwd", "a/b/c", "..", ".", "x\\y"} {
		got := safeName(input)
		if strings.ContainsAny(got, `/\`) || got == ".." || got == "." {
			t.Errorf("safeName(%q) = %q still traverses", input, got)
		}
	}
}

func TestDisabledStoreIsInert(t *testing.T) {
	// A store whose root cannot be created must degrade quietly: losing history
	// is acceptable, refusing to run agents is not. A regular file where the
	// root should go is what makes MkdirAll fail.
	root := t.TempDir()
	blocker := filepath.Join(root, "blocker")
	if err := os.WriteFile(blocker, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("write blocker: %v", err)
	}

	store := New(filepath.Join(blocker, "history"))
	defer store.Close()
	if !store.disabled {
		t.Fatal("store should have disabled itself when its root could not be created")
	}
	if err := store.Append("ws-1", "thread-a", event("thread-a", "x", 1)); err != nil {
		t.Errorf("Append on disabled store should be a no-op, got %v", err)
	}
	if err := store.SaveMeta(Meta{Workspace: domain.Workspace{ID: "ws-1"}}); err != nil {
		t.Errorf("SaveMeta on disabled store should be a no-op, got %v", err)
	}
	if list, err := store.List(); err != nil || len(list) != 0 {
		t.Errorf("List on disabled store = %v, %v", list, err)
	}
}
