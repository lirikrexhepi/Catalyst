package git

import (
	"context"
	"path/filepath"
	"testing"
)

func TestStageCommitAndBranches(t *testing.T) {
	t.Setenv("GIT_AUTHOR_NAME", "test")
	t.Setenv("GIT_AUTHOR_EMAIL", "test@example.com")
	t.Setenv("GIT_COMMITTER_NAME", "test")
	t.Setenv("GIT_COMMITTER_EMAIL", "test@example.com")

	root := newRepo(t)
	repo := &Repo{Root: root}
	ctx := context.Background()

	writeFile(t, filepath.Join(root, "a.txt"), "one\n")
	if err := repo.Commit(ctx, "nothing staged", ""); err == nil {
		t.Fatal("commit with nothing staged should fail")
	}
	if err := repo.Stage(ctx, []string{"a.txt"}); err != nil {
		t.Fatal(err)
	}
	if err := repo.Commit(ctx, "", ""); err == nil {
		t.Fatal("commit without a summary should fail")
	}
	if err := repo.Commit(ctx, "add a", "body"); err != nil {
		t.Fatal(err)
	}

	writeFile(t, filepath.Join(root, "a.txt"), "two\n")
	if err := repo.Stage(ctx, []string{"a.txt"}); err != nil {
		t.Fatal(err)
	}
	if err := repo.Unstage(ctx, []string{"a.txt"}); err != nil {
		t.Fatal(err)
	}
	files, err := repo.Status(ctx)
	if err != nil || len(files) != 1 || files[0].Staged {
		t.Fatalf("expected one unstaged change, got %+v (%v)", files, err)
	}

	if err := repo.CreateBranch(ctx, "feature"); err != nil {
		t.Fatal(err)
	}
	branches, err := repo.Branches(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var current string
	for _, branch := range branches {
		if branch.Current {
			current = branch.Name
		}
	}
	if current != "feature" {
		t.Fatalf("current branch = %q, want feature", current)
	}
	if upstream, _, _ := repo.Sync(ctx); upstream != "" {
		t.Fatalf("a local-only branch has no upstream, got %q", upstream)
	}
}

func TestCheckoutWithLocalChanges(t *testing.T) {
	t.Setenv("GIT_AUTHOR_NAME", "test")
	t.Setenv("GIT_AUTHOR_EMAIL", "test@example.com")
	t.Setenv("GIT_COMMITTER_NAME", "test")
	t.Setenv("GIT_COMMITTER_EMAIL", "test@example.com")

	root := newRepo(t)
	repo := &Repo{Root: root}
	ctx := context.Background()

	mustRun(t, root, "branch", "other")
	writeFile(t, filepath.Join(root, "shared.txt"), "edited\n")

	if err := repo.Checkout(ctx, "other", "leave"); err != nil {
		t.Fatal(err)
	}
	files, _ := repo.Status(ctx)
	if len(files) != 0 {
		t.Fatalf("leaving changes should clean the new branch, got %+v", files)
	}

	if err := repo.Checkout(ctx, "main", "plain"); err != nil {
		t.Fatal(err)
	}
	mustRun(t, root, "stash", "pop")
	writeFile(t, filepath.Join(root, "shared.txt"), "edited again\n")
	if err := repo.Checkout(ctx, "other", "bring"); err != nil {
		t.Fatal(err)
	}
	files, _ = repo.Status(ctx)
	if len(files) != 1 {
		t.Fatalf("bringing changes should carry them over, got %+v", files)
	}
}
