package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func mustRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@example.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// newRepo builds a throwaway repository with one commit on the default branch.
func newRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	mustRun(t, root, "init", "-b", "main")
	writeFile(t, filepath.Join(root, "shared.txt"), "base\n")
	mustRun(t, root, "add", ".")
	mustRun(t, root, "commit", "-m", "init")
	return root
}

func TestWorktreeLifecycleAndHandoff(t *testing.T) {
	ctx := context.Background()
	root := newRepo(t)

	repo, ok := Open(ctx, root)
	if !ok {
		t.Fatal("expected a git repository")
	}

	// Two isolated checkouts, the shape used for parallel agents.
	pathA := filepath.Join(filepath.Dir(root), "wt-a-"+filepath.Base(root))
	worktree, err := repo.AddWorktree(ctx, pathA, "feature-a", "main")
	if err != nil {
		t.Fatalf("add worktree: %v", err)
	}
	defer repo.RemoveWorktree(ctx, pathA, true)

	if worktree.Branch != "feature-a" || worktree.BaseBranch != "main" {
		t.Errorf("unexpected worktree: %+v", worktree)
	}
	if _, err := os.Stat(filepath.Join(pathA, "shared.txt")); err != nil {
		t.Errorf("worktree missing base content: %v", err)
	}

	// Work happens in the isolated checkout only.
	writeFile(t, filepath.Join(pathA, "feature.txt"), "one\ntwo\n")
	mustRun(t, pathA, "add", ".")
	mustRun(t, pathA, "commit", "-m", "add feature")

	handoff, err := repo.Handoff(ctx, worktree)
	if err != nil {
		t.Fatalf("handoff: %v", err)
	}
	if handoff.Commits != 1 {
		t.Errorf("commits = %d, want 1", handoff.Commits)
	}
	if handoff.FilesChanged != 1 || handoff.Insertions != 2 {
		t.Errorf("diff stat = %d files / +%d, want 1 / +2", handoff.FilesChanged, handoff.Insertions)
	}
	if !handoff.CleanMerge {
		t.Errorf("expected a clean merge, got conflicts %v", handoff.Conflicts)
	}
}

// TestHandoffDetectsConflict is the case that decides whether Catalyst can hand
// off safely: two agents editing the same file must be reported, not merged.
func TestHandoffDetectsConflict(t *testing.T) {
	ctx := context.Background()
	root := newRepo(t)

	repo, ok := Open(ctx, root)
	if !ok {
		t.Fatal("expected a git repository")
	}

	// main moves ahead, so the branch now diverges on the same line.
	writeFile(t, filepath.Join(root, "shared.txt"), "changed on main\n")
	mustRun(t, root, "add", ".")
	mustRun(t, root, "commit", "-m", "main edit")

	path := filepath.Join(filepath.Dir(root), "wt-c-"+filepath.Base(root))
	worktree, err := repo.AddWorktree(ctx, path, "feature-c", "main~1")
	if err != nil {
		t.Fatalf("add worktree: %v", err)
	}
	defer repo.RemoveWorktree(ctx, path, true)

	writeFile(t, filepath.Join(path, "shared.txt"), "changed on branch\n")
	mustRun(t, path, "add", ".")
	mustRun(t, path, "commit", "-m", "branch edit")

	worktree.BaseBranch = "main"
	handoff, err := repo.Handoff(ctx, worktree)
	if err != nil {
		t.Fatalf("handoff: %v", err)
	}
	if handoff.CleanMerge {
		t.Error("expected the conflicting branch to be reported as unclean")
	}
	if len(handoff.Conflicts) == 0 || handoff.Conflicts[0] != "shared.txt" {
		t.Errorf("conflicts = %v, want [shared.txt]", handoff.Conflicts)
	}
}
