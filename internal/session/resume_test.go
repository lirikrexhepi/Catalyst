package session

import (
	"context"
	"path/filepath"
	"testing"

	"catalyst/internal/domain"
)

func TestResumeRejectsMissingWorkingDirectory(t *testing.T) {
	spawner := NewSpawner(NewManager(nil), NewWorkspaces())

	// A worktree that has been merged and pruned is the common case here.
	gone := filepath.Join(t.TempDir(), "worktree-that-was-removed")
	result := spawner.Resume(context.Background(), []ResumeRequest{{
		ThreadID:          "thread-a",
		Driver:            domain.DriverClaude,
		Cwd:               gone,
		ProviderSessionID: "sess-1",
	}})

	if len(result.Outcomes) != 1 {
		t.Fatalf("expected one outcome, got %d", len(result.Outcomes))
	}
	outcome := result.Outcomes[0]
	if outcome.Live {
		t.Error("a task whose directory is gone must not report as live")
	}
	if outcome.Reason == "" {
		t.Error("a refusal must say why")
	}
}

func TestResumeRejectsIncompleteRecord(t *testing.T) {
	spawner := NewSpawner(NewManager(nil), NewWorkspaces())

	result := spawner.Resume(context.Background(), []ResumeRequest{
		{ThreadID: "", Driver: domain.DriverClaude},
		{ThreadID: "thread-b", Driver: ""},
	})

	if len(result.Outcomes) != 2 {
		t.Fatalf("every request must yield an outcome, got %d", len(result.Outcomes))
	}
	for _, outcome := range result.Outcomes {
		if outcome.Live {
			t.Errorf("incomplete record reported live: %+v", outcome)
		}
		if outcome.Reason == "" {
			t.Errorf("incomplete record gave no reason: %+v", outcome)
		}
	}
}

func TestResumeIsIndependentPerTask(t *testing.T) {
	spawner := NewSpawner(NewManager(nil), NewWorkspaces())

	// One bad task must not stop the others from being attempted; each gets its
	// own verdict.
	result := spawner.Resume(context.Background(), []ResumeRequest{
		{ThreadID: "a", Driver: domain.DriverClaude, Cwd: filepath.Join(t.TempDir(), "missing")},
		{ThreadID: "b", Driver: ""},
		{ThreadID: "c", Driver: domain.DriverClaude, Cwd: filepath.Join(t.TempDir(), "also-missing")},
	})

	if len(result.Outcomes) != 3 {
		t.Fatalf("expected 3 outcomes, got %d", len(result.Outcomes))
	}
	for i, outcome := range result.Outcomes {
		if outcome.ThreadID == "" {
			t.Errorf("outcome %d lost its thread id", i)
		}
	}
}

func TestCoordinatorThreadIsPerWorkspace(t *testing.T) {
	// The identity that makes a stored session more than one agent's chat log:
	// each workspace files its orchestrator transcript under its own thread.
	if CoordinatorThreadFor("ws-1") == CoordinatorThreadFor("ws-2") {
		t.Fatal("two workspaces must not share an orchestrator transcript")
	}
	if got := CoordinatorThreadFor(""); got != CoordinatorThreadID {
		t.Errorf("an unbound coordinator should keep the live thread id, got %q", got)
	}
}
