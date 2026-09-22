package git

import (
	"context"
	"path/filepath"
	"strconv"
	"strings"

	"composer/internal/domain"
)

// maxCommits bounds a branch's history. Far past this the list stops being
// something a person reads and becomes something they scroll.
const maxCommits = 60

// Checkout is one working tree attached to a repository: the main one, or an
// isolated worktree an agent was given.
type Checkout struct {
	Path   string
	Branch string
	// Detached reports a worktree not on any branch, which has no base to
	// compare against and therefore no meaningful ahead count.
	Detached bool
	IsMain   bool
}

// Worktrees lists every checkout git knows about.
//
// Reading this from git rather than from Composer's own records is the point:
// a worktree left behind by a crashed run, or one whose task was never
// recorded, only shows up here.
func (r *Repo) Worktrees(ctx context.Context) ([]Checkout, error) {
	raw, err := runRaw(ctx, r.Root, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}

	var checkouts []Checkout
	var current *Checkout

	flush := func() {
		if current != nil && current.Path != "" {
			current.IsMain = sameDir(current.Path, r.Root)
			checkouts = append(checkouts, *current)
		}
		current = nil
	}

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "worktree "):
			flush()
			current = &Checkout{Path: filepath.Clean(strings.TrimPrefix(line, "worktree "))}
		case current == nil:
			continue
		case strings.HasPrefix(line, "branch "):
			ref := strings.TrimPrefix(line, "branch ")
			current.Branch = strings.TrimPrefix(ref, "refs/heads/")
		case line == "detached":
			current.Detached = true
		}
	}
	flush()

	return checkouts, nil
}

func sameDir(left, right string) bool {
	return strings.EqualFold(filepath.Clean(left), filepath.Clean(right))
}

// Commits lists a branch's history, marking which entries the base already had.
//
// Both sides come from one call rather than two: asking for the base's commits
// separately would race any concurrent commit and could report a commit as both
// new and inherited, or as neither.
func (r *Repo) Commits(ctx context.Context, base string) ([]domain.Commit, int, error) {
	const separator = "\x1f"
	format := strings.Join([]string{"%H", "%h", "%s", "%an", "%at"}, separator)

	raw, err := runRaw(ctx, r.Root, "log", "--no-color",
		"--max-count="+strconv.Itoa(maxCommits), "--format="+format)
	if err != nil {
		return nil, 0, err
	}

	inherited := r.baseCommits(ctx, base)
	commits := make([]domain.Commit, 0, 16)
	ahead := 0

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		fields := strings.Split(line, separator)
		if len(fields) < 5 {
			continue
		}

		at, _ := strconv.ParseInt(fields[4], 10, 64)
		commit := domain.Commit{
			SHA:     fields[0],
			Short:   fields[1],
			Subject: fields[2],
			Author:  fields[3],
			At:      at * 1000,
			OnBase:  inherited[fields[0]],
		}
		if !commit.OnBase {
			ahead++
		}
		commits = append(commits, commit)
	}
	return commits, ahead, nil
}

// baseCommits is the set of commits the base branch already contained.
//
// An empty set is a valid answer: a worktree whose base was deleted, or a
// repository with a single branch, simply has nothing inherited, and treating
// that as an error would blank the history rather than show it.
func (r *Repo) baseCommits(ctx context.Context, base string) map[string]bool {
	inherited := make(map[string]bool)
	if base == "" {
		return inherited
	}

	raw, err := runRaw(ctx, r.Root, "log", "--no-color",
		"--max-count="+strconv.Itoa(maxCommits*4), "--format=%H", base)
	if err != nil {
		return inherited
	}
	for _, line := range strings.Split(raw, "\n") {
		if sha := strings.TrimSpace(line); sha != "" {
			inherited[sha] = true
		}
	}
	return inherited
}
