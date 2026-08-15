package session

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"catalyst/internal/domain"
	"catalyst/internal/drivers"
	"catalyst/internal/git"
	"catalyst/internal/provider"
	"catalyst/internal/shell"
)

func TestParseTasks(t *testing.T) {
	reply := "Here is the plan:\n\n" +
		"```catalyst:tasks\n" +
		`{"tasks":[{"title":"Add login","prompt":"Implement the login form"},` +
		`{"title":"Add logout","prompt":"Implement logout"}]}` +
		"\n```\n\nBoth can run in parallel."

	tasks := ParseTasks(reply)
	if len(tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(tasks))
	}
	if tasks[0].Title != "Add login" || tasks[1].Prompt != "Implement logout" {
		t.Errorf("unexpected tasks: %+v", tasks)
	}

	if stripped := StripTaskBlock(reply); strings.Contains(stripped, "catalyst:tasks") {
		t.Errorf("block leaked into display text: %q", stripped)
	}

	// A conversational reply must not produce phantom tasks.
	if got := ParseTasks("You are talking to Claude. No work needed."); len(got) != 0 {
		t.Errorf("expected no tasks, got %+v", got)
	}
	// Malformed JSON must fail closed rather than spawn garbage.
	if got := ParseTasks("```catalyst:tasks\n{not json}\n```"); len(got) != 0 {
		t.Errorf("expected no tasks from bad JSON, got %+v", got)
	}
}

func gitInit(t *testing.T, root string) {
	t.Helper()
	for _, args := range [][]string{
		{"init", "-b", "main"},
		{"config", "user.email", "t@example.com"},
		{"config", "user.name", "t"},
		{"add", "."},
		{"commit", "-m", "init"},
	} {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, out)
		}
	}
}

// TestSpawnCreatesIsolatedAgents is the end-to-end proof of the orchestrator
// model: two tasks, two live CLI sessions, two isolated worktrees.
func TestSpawnCreatesIsolatedAgents(t *testing.T) {
	env := shell.BaseEnvironment()
	if _, ok := shell.LookPath("claude", env); !ok {
		t.Skip("claude CLI not installed")
	}

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# demo\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitInit(t, root)

	manager := NewManager(provider.NewRegistry(drivers.All()...))
	workspaces := NewWorkspaces()
	spawner := NewSpawner(manager, workspaces)

	events, unsubscribe := manager.Bus().Subscribe()
	defer unsubscribe()
	defer manager.StopAll(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	result, err := spawner.Spawn(ctx, []SpawnRequest{
		{Title: "Write alpha", Prompt: `Create a file named alpha.txt containing exactly: ALPHA. Then stop.`},
		{Title: "Write beta", Prompt: `Create a file named beta.txt containing exactly: BETA. Then stop.`},
	}, SpawnOptions{
		Driver:      domain.DriverClaude,
		Model:       "claude-haiku-4-5",
		Cwd:         root,
		UseWorktree: true,
		Prompt:      "two demo tasks",
	})
	if err != nil {
		t.Fatalf("spawn: %v (%v)", err, result.Errors)
	}

	if len(result.Tasks) != 2 {
		t.Fatalf("expected 2 tasks, got %d (%v)", len(result.Tasks), result.Errors)
	}

	// Each task must be isolated in its own branch and directory.
	seenPaths := map[string]bool{}
	for _, task := range result.Tasks {
		if task.Worktree == nil {
			t.Fatalf("task %q has no worktree", task.Title)
		}
		if seenPaths[task.Worktree.Path] {
			t.Errorf("tasks share a worktree: %s", task.Worktree.Path)
		}
		seenPaths[task.Worktree.Path] = true

		if !strings.HasPrefix(task.Worktree.Branch, "catalyst/") {
			t.Errorf("unexpected branch %q", task.Worktree.Branch)
		}
		// Worktrees must live outside the project directory.
		if strings.HasPrefix(task.Worktree.Path, root) {
			t.Errorf("worktree %s was created inside the project", task.Worktree.Path)
		}
		t.Logf("%-12s -> %s (%s)", task.Title, task.Worktree.Branch, task.Worktree.Path)
	}

	if tasks := workspaces.Tasks(result.Workspace.ID); len(tasks) != 2 {
		t.Errorf("workspace grouping lost tasks: %d", len(tasks))
	}

	// Both agents must actually run to completion.
	pending := map[string]bool{}
	for _, task := range result.Tasks {
		pending[task.ThreadID] = true
	}

	deadline := time.After(4 * time.Minute)
	for len(pending) > 0 {
		select {
		case <-deadline:
			t.Fatalf("timed out with %d task(s) unfinished", len(pending))
		case event := <-events:
			switch event.Kind {
			case domain.EventTurnFailed:
				t.Errorf("task %s failed: %s", event.ThreadID, event.Error)
				delete(pending, event.ThreadID)
			case domain.EventTurnCompleted:
				delete(pending, event.ThreadID)
			}
		}
	}

	// The isolation is only real if each file landed in its own worktree.
	for _, task := range result.Tasks {
		want := "alpha.txt"
		if strings.Contains(task.Title, "beta") {
			want = "beta.txt"
		}
		if _, err := os.Stat(filepath.Join(task.Worktree.Path, want)); err != nil {
			t.Errorf("%s: expected %s in its worktree: %v", task.Title, want, err)
		}

		repo, ok := git.Open(ctx, task.Worktree.Path)
		if !ok {
			t.Fatalf("worktree %s is not a repo", task.Worktree.Path)
		}
		defer repo.RemoveWorktree(context.Background(), task.Worktree.Path, true)
	}
}

// TestOrchestratorEmitsPlan checks the system prompt actually produces a
// parseable task block for a two-feature request, which the whole delegation
// flow depends on.
func TestOrchestratorEmitsPlan(t *testing.T) {
	env := shell.BaseEnvironment()
	if _, ok := shell.LookPath("claude", env); !ok {
		t.Skip("claude CLI not installed")
	}

	manager := NewManager(provider.NewRegistry(drivers.All()...))
	coordinator := NewCoordinator(manager)
	events, unsubscribe := manager.Bus().Subscribe()
	defer unsubscribe()
	defer manager.StopAll(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()

	turnID, err := coordinator.Send(ctx, Config{
		Driver: string(domain.DriverClaude),
		Model:  "claude-haiku-4-5",
	}, "Today we work on two things: add a dark mode toggle to the settings page, and add CSV export to the reports page.")
	if err != nil {
		t.Fatalf("send: %v", err)
	}

	var reply strings.Builder
	deadline := time.After(3 * time.Minute)
	for {
		select {
		case <-deadline:
			t.Fatal("timed out")
		case event := <-events:
			if event.TurnID != turnID {
				continue
			}
			switch event.Kind {
			case domain.EventAgentMessage:
				reply.WriteString(event.Text)
			case domain.EventTurnFailed:
				t.Fatalf("turn failed: %s", event.Error)
			case domain.EventTurnCompleted:
				tasks := ParseTasks(reply.String())
				t.Logf("reply:\n%s", reply.String())
				if len(tasks) != 2 {
					t.Fatalf("expected 2 tasks, parsed %d", len(tasks))
				}
				for _, task := range tasks {
					if task.Title == "" || task.Prompt == "" {
						t.Errorf("incomplete task: %+v", task)
					}
					t.Logf("task: %s", task.Title)
				}
				return
			}
		}
	}
}

// TestSpawnHonoursPerTaskCwd proves a task naming another directory actually
// runs there, rather than in the plan-wide working directory.
func TestSpawnHonoursPerTaskCwd(t *testing.T) {
	if _, ok := shell.LookPath("claude", shell.BaseEnvironment()); !ok {
		t.Skip("claude CLI not installed")
	}

	home := t.TempDir()
	away := t.TempDir()
	if err := os.WriteFile(filepath.Join(away, "MARKER.txt"), []byte("away\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	manager := NewManager(provider.NewRegistry(drivers.All()...))
	spawner := NewSpawner(manager, NewWorkspaces())
	events, unsubscribe := manager.Bus().Subscribe()
	defer unsubscribe()
	defer manager.StopAll(context.Background())

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()

	result, err := spawner.Spawn(ctx, []SpawnRequest{{
		Title:  "Report cwd",
		Prompt: "Create a file named FOUND.txt in the current directory containing the word FOUND. Then stop.",
		Cwd:    away,
	}}, SpawnOptions{
		Driver: domain.DriverClaude,
		Model:  "claude-haiku-4-5",
		Cwd:    home,
	})
	if err != nil {
		t.Fatalf("spawn: %v (%v)", err, result.Errors)
	}

	deadline := time.After(3 * time.Minute)
	for done := false; !done; {
		select {
		case <-deadline:
			t.Fatal("timed out")
		case event := <-events:
			if event.Kind == domain.EventTurnCompleted || event.Kind == domain.EventTurnFailed {
				done = true
			}
		}
	}

	if _, err := os.Stat(filepath.Join(away, "FOUND.txt")); err != nil {
		t.Errorf("agent did not run in its own cwd: %v", err)
	}
	if _, err := os.Stat(filepath.Join(home, "FOUND.txt")); err == nil {
		t.Error("agent ran in the plan-wide cwd instead of the task's own")
	}
}
