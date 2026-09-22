package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"composer/internal/domain"
)

// The shape `git diff` emits: a header block that carries no rows, then hunks
// whose line numbers come from their own headers.
const twoHunkDiff = `diff --git a/app.go b/app.go
index 8876338..c5a315d 100644
--- a/app.go
+++ b/app.go
@@ -7,4 +7,5 @@ import (
 	"context"
 	"fmt"
-	"old"
+	"new"
+	"extra"
@@ -40,3 +41,3 @@ func main() {
 	run()
-	stop()
+	halt()
`

func TestParseUnifiedNumbersBothSides(t *testing.T) {
	diff := parseUnified("app.go", twoHunkDiff)

	if len(diff.Hunks) != 2 {
		t.Fatalf("hunks = %d, want 2", len(diff.Hunks))
	}
	if diff.Insertions != 3 || diff.Deletions != 2 {
		t.Errorf("+%d -%d, want +3 -2", diff.Insertions, diff.Deletions)
	}

	first := diff.Hunks[0].Lines
	// Context rows advance both sides; the removal advances only the old side,
	// so the additions after it must still start at 9 on the new side.
	if first[0].Old != 7 || first[0].New != 7 {
		t.Errorf("first context = old %d new %d, want 7/7", first[0].Old, first[0].New)
	}
	if first[2].Kind != domain.DiffRemoved || first[2].Old != 9 || first[2].New != 0 {
		t.Errorf("removal = %+v, want old 9 and no new line", first[2])
	}
	if first[3].Kind != domain.DiffAdded || first[3].New != 9 || first[3].Old != 0 {
		t.Errorf("addition = %+v, want new 9 and no old line", first[3])
	}
	if first[4].New != 10 {
		t.Errorf("second addition new = %d, want 10", first[4].New)
	}

	// The second hunk restarts from its own header rather than continuing.
	if second := diff.Hunks[1].Lines[0]; second.Old != 40 || second.New != 41 {
		t.Errorf("second hunk starts at old %d new %d, want 40/41", second.Old, second.New)
	}
}

func TestParseUnifiedStripsOnlyTheMarkerColumn(t *testing.T) {
	// A removed line whose content itself begins with '-' must keep that
	// character; stripping more than the marker would corrupt the diff.
	diff := parseUnified("x.md", "@@ -1,2 +1,2 @@\n-- dashed item\n+ + plus item\n")

	if got := diff.Hunks[0].Lines[0].Content; got != "- dashed item" {
		t.Errorf("removed content = %q, want %q", got, "- dashed item")
	}
	if got := diff.Hunks[0].Lines[1].Content; got != " + plus item" {
		t.Errorf("added content = %q, want %q", got, " + plus item")
	}
}

func TestParseUnifiedIgnoresNoNewlineMarker(t *testing.T) {
	diff := parseUnified("x.txt", "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n")

	for _, line := range diff.Hunks[0].Lines {
		if line.Content == " No newline at end of file" {
			t.Fatal("the no-newline marker was rendered as a diff row")
		}
	}
	if len(diff.Hunks[0].Lines) != 2 {
		t.Errorf("rows = %d, want 2", len(diff.Hunks[0].Lines))
	}
}

func TestParseUnifiedFlagsBinary(t *testing.T) {
	diff := parseUnified("logo.png", "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n")
	if !diff.Binary {
		t.Error("expected the binary flag to be set")
	}
}

func TestSplitFileDiffsSeparatesFiles(t *testing.T) {
	raw := twoHunkDiff + `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old title
+new title
`
	diffs := splitFileDiffs(raw)
	if len(diffs) != 2 {
		t.Fatalf("files = %d, want 2", len(diffs))
	}
	if diffs[0].Path != "app.go" || diffs[1].Path != "README.md" {
		t.Errorf("paths = %q, %q", diffs[0].Path, diffs[1].Path)
	}
}

func TestPathFromHeaderHandlesSpaces(t *testing.T) {
	got := pathFromHeader("diff --git a/my dir/a file.txt b/my dir/a file.txt")
	if got != "my dir/a file.txt" {
		t.Errorf("path = %q", got)
	}
}

// scratchRepo builds a real repository so status and worktree parsing are
// exercised against git's actual output rather than a fixture of it.
func scratchRepo(t *testing.T) *Repo {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}

	dir := t.TempDir()
	for _, args := range [][]string{
		{"init", "-b", "main"},
		{"config", "user.email", "test@example.com"},
		{"config", "user.name", "Test"},
		{"config", "commit.gpgsign", "false"},
	} {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, out)
		}
	}

	write(t, dir, "kept.txt", "one\ntwo\nthree\n")
	commit(t, dir, "initial")

	repo, ok := Open(context.Background(), dir)
	if !ok {
		t.Fatal("Open did not find the repository it just created")
	}
	return repo
}

func write(t *testing.T, dir, name, body string) {
	t.Helper()
	full := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

func commit(t *testing.T, dir, message string) {
	t.Helper()
	for _, args := range [][]string{{"add", "-A"}, {"commit", "-m", message}} {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v: %s", args, err, out)
		}
	}
}

func TestStatusReportsEachKindOfChange(t *testing.T) {
	repo := scratchRepo(t)
	ctx := context.Background()

	write(t, repo.Root, "kept.txt", "one\ntwo\nthree\nfour\n")
	write(t, repo.Root, "fresh.txt", "brand new\n")

	changes, err := repo.Status(ctx)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}

	byPath := map[string]domain.FileChange{}
	for _, change := range changes {
		byPath[change.Path] = change
	}

	if got := byPath["kept.txt"]; got.Status != domain.ChangeModified {
		t.Errorf("kept.txt = %q, want modified", got.Status)
	}
	if got := byPath["fresh.txt"]; got.Status != domain.ChangeUntracked {
		t.Errorf("fresh.txt = %q, want untracked", got.Status)
	}
	// Counts come from numstat and are what the file row shows beside the name.
	if got := byPath["kept.txt"]; got.Insertions != 1 {
		t.Errorf("kept.txt insertions = %d, want 1", got.Insertions)
	}
}

func TestStatusListsAFileStagedAndEditedAgainTwice(t *testing.T) {
	repo := scratchRepo(t)
	ctx := context.Background()

	write(t, repo.Root, "kept.txt", "staged\n")
	stage := exec.Command("git", "add", "kept.txt")
	stage.Dir = repo.Root
	if out, err := stage.CombinedOutput(); err != nil {
		t.Fatalf("git add: %v: %s", err, out)
	}
	write(t, repo.Root, "kept.txt", "staged then edited again\n")

	changes, err := repo.Status(ctx)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}

	staged, unstaged := 0, 0
	for _, change := range changes {
		if change.Path != "kept.txt" {
			continue
		}
		if change.Staged {
			staged++
		} else {
			unstaged++
		}
	}
	// The two sides are genuinely different diffs; collapsing them into one row
	// would show the user only half of what they changed.
	if staged != 1 || unstaged != 1 {
		t.Errorf("staged=%d unstaged=%d, want one of each", staged, unstaged)
	}
}

func TestUntrackedFileDiffsAsEntirelyAdded(t *testing.T) {
	repo := scratchRepo(t)
	write(t, repo.Root, "fresh.txt", "alpha\nbeta\n")

	diff, err := repo.FileDiff(context.Background(), "fresh.txt", false)
	if err != nil {
		t.Fatalf("FileDiff: %v", err)
	}
	if diff.Insertions != 2 {
		t.Errorf("insertions = %d, want 2", diff.Insertions)
	}
	if len(diff.Hunks) != 1 || len(diff.Hunks[0].Lines) != 2 {
		t.Fatalf("hunks = %+v", diff.Hunks)
	}
	if line := diff.Hunks[0].Lines[0]; line.Kind != domain.DiffAdded || line.New != 1 {
		t.Errorf("first line = %+v, want an addition numbered 1", line)
	}
}

func TestWorktreesListsMainAndAddedCheckouts(t *testing.T) {
	repo := scratchRepo(t)
	ctx := context.Background()

	extra := filepath.Join(t.TempDir(), "feature")
	if _, err := repo.AddWorktree(ctx, extra, "feature-branch", "main"); err != nil {
		t.Fatalf("AddWorktree: %v", err)
	}

	checkouts, err := repo.Worktrees(ctx)
	if err != nil {
		t.Fatalf("Worktrees: %v", err)
	}
	if len(checkouts) != 2 {
		t.Fatalf("checkouts = %d, want 2: %+v", len(checkouts), checkouts)
	}

	var main, feature *Checkout
	for i := range checkouts {
		if checkouts[i].IsMain {
			main = &checkouts[i]
		} else {
			feature = &checkouts[i]
		}
	}
	if main == nil || main.Branch != "main" {
		t.Errorf("main checkout = %+v", main)
	}
	if feature == nil || feature.Branch != "feature-branch" {
		t.Errorf("feature checkout = %+v", feature)
	}
}

func TestCommitsSeparateNewWorkFromInherited(t *testing.T) {
	repo := scratchRepo(t)
	ctx := context.Background()

	extra := filepath.Join(t.TempDir(), "feature")
	if _, err := repo.AddWorktree(ctx, extra, "feature-branch", "main"); err != nil {
		t.Fatalf("AddWorktree: %v", err)
	}
	write(t, extra, "added.txt", "work\n")
	commit(t, extra, "agent work")

	branch := &Repo{Root: extra}
	commits, ahead, err := branch.Commits(ctx, "main")
	if err != nil {
		t.Fatalf("Commits: %v", err)
	}
	if ahead != 1 {
		t.Errorf("ahead = %d, want 1", ahead)
	}
	if len(commits) != 2 {
		t.Fatalf("commits = %d, want 2", len(commits))
	}
	// Without this split every branch would look like it contained the whole
	// project's history as its own work.
	if commits[0].OnBase {
		t.Error("the agent's own commit was marked as inherited")
	}
	if !commits[1].OnBase {
		t.Error("the base commit was not marked as inherited")
	}
	if commits[0].Subject != "agent work" {
		t.Errorf("subject = %q", commits[0].Subject)
	}
}

func TestCommitDiffReturnsEachTouchedFile(t *testing.T) {
	repo := scratchRepo(t)
	ctx := context.Background()

	write(t, repo.Root, "kept.txt", "one\ntwo\nthree\nfour\n")
	write(t, repo.Root, "other.txt", "new file\n")
	commit(t, repo.Root, "touch two files")

	commits, _, err := repo.Commits(ctx, "")
	if err != nil {
		t.Fatalf("Commits: %v", err)
	}

	diffs, err := repo.CommitDiff(ctx, commits[0].SHA)
	if err != nil {
		t.Fatalf("CommitDiff: %v", err)
	}
	if len(diffs) != 2 {
		t.Fatalf("files = %d, want 2: %+v", len(diffs), diffs)
	}
}
