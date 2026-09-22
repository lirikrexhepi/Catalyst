package main

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"sync"

	"composer/internal/domain"
	"composer/internal/git"
	"composer/internal/reveal"
)

// GitOverview reports what has changed in the project and in every agent
// worktree cut from it.
//
// Checkouts come from git rather than from Composer's own task records, so a
// worktree left behind by a crashed run still appears — flagged as orphaned,
// which is the case worth reviewing before removing it.
func (a *App) GitOverview() ([]domain.WorktreeChanges, error) {
	root := a.resolveCwd("")
	if root == "" {
		return nil, errors.New("no project is open")
	}

	repo, ok := git.Open(a.ctx, root)
	if !ok {
		return nil, fmt.Errorf("%s is not a git repository", root)
	}

	checkouts, err := repo.Worktrees(a.ctx)
	if err != nil {
		return nil, err
	}

	owners := a.worktreeOwners()
	mainBranch, _ := repo.CurrentBranch(a.ctx)

	lanes := make([]domain.WorktreeChanges, len(checkouts))
	var wait sync.WaitGroup

	// One checkout's git calls do not depend on any other's, and a project with
	// several agents would otherwise pay for them in series every refresh.
	for i, checkout := range checkouts {
		wait.Add(1)
		go func(index int, checkout git.Checkout) {
			defer wait.Done()
			lanes[index] = a.laneFor(checkout, owners, mainBranch)
		}(i, checkout)
	}
	wait.Wait()

	// The project itself first, then agents oldest-first so a lane does not jump
	// position between refreshes.
	sort.SliceStable(lanes, func(i, j int) bool {
		if lanes[i].IsMain != lanes[j].IsMain {
			return lanes[i].IsMain
		}
		return lanes[i].Title < lanes[j].Title
	})
	return lanes, nil
}

// laneFor gathers one checkout's changes.
//
// A failure is recorded on the lane rather than returned: one unreadable
// worktree must not blank the whole window, and the reason belongs next to the
// lane it applies to.
func (a *App) laneFor(checkout git.Checkout, owners map[string]domain.Task, mainBranch string) domain.WorktreeChanges {
	lane := domain.WorktreeChanges{
		Path:   checkout.Path,
		Branch: checkout.Branch,
		IsMain: checkout.IsMain,
		Title:  filepath.Base(checkout.Path),
	}
	if checkout.Detached {
		lane.Branch = "detached"
	}

	if task, ok := owners[normalisePath(checkout.Path)]; ok {
		lane.ThreadID = task.ThreadID
		if task.Title != "" {
			lane.Title = task.Title
		}
		if task.Worktree != nil {
			lane.Base = task.Worktree.BaseBranch
		}
	} else if !checkout.IsMain {
		lane.Orphaned = true
		if checkout.Branch != "" {
			lane.Title = checkout.Branch
		}
	}

	if lane.Base == "" && !checkout.IsMain {
		lane.Base = mainBranch
	}

	working := &git.Repo{Root: checkout.Path}

	files, err := working.Status(a.ctx)
	if err != nil {
		lane.Error = err.Error()
		return lane
	}
	lane.Files = files

	commits, ahead, err := working.Commits(a.ctx, lane.Base)
	if err != nil {
		// History is secondary to the changed files, so a repository with no
		// commits yet still shows its working tree instead of an error.
		return lane
	}
	lane.Commits = commits
	// Ahead answers "what has this agent added on top of its base", which the
	// project itself has no base for. Counting there would report the repo's
	// whole history as unmerged work.
	if !checkout.IsMain {
		lane.Ahead = ahead
	}
	return lane
}

// worktreeOwners maps a worktree path to the task that was given it.
func (a *App) worktreeOwners() map[string]domain.Task {
	owners := make(map[string]domain.Task)
	for _, workspace := range a.workspaces.List() {
		for _, task := range a.workspaces.Tasks(workspace.ID) {
			if task.Worktree == nil || task.Worktree.Path == "" {
				continue
			}
			owners[normalisePath(task.Worktree.Path)] = task
		}
	}
	return owners
}

// normalisePath makes paths comparable across the two sources they arrive from:
// git reports its own casing and separators, Composer records what it created.
func normalisePath(path string) string {
	absolute, err := filepath.Abs(path)
	if err != nil {
		absolute = path
	}
	return filepath.Clean(absolute)
}

// GitFileDiff returns one file's changes inside the given checkout.
func (a *App) GitFileDiff(worktreePath, file string, staged bool) (domain.DiffFile, error) {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return domain.DiffFile{}, err
	}
	return repo.FileDiff(a.ctx, file, staged)
}

// GitCommitDiff returns every file one commit touched.
func (a *App) GitCommitDiff(worktreePath, sha string) ([]domain.DiffFile, error) {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return nil, err
	}
	return repo.CommitDiff(a.ctx, sha)
}

// RemoveGitWorktree deletes a checkout the user has decided was not needed.
//
// Without force, git itself refuses while the worktree holds uncommitted work,
// which is the guard that matters: the caller surfaces that refusal and asks
// again rather than deciding on the user's behalf that the work is disposable.
func (a *App) RemoveGitWorktree(worktreePath string, force bool) error {
	root := a.resolveCwd("")
	repo, ok := git.Open(a.ctx, root)
	if !ok {
		return fmt.Errorf("%s is not a git repository", root)
	}
	if normalisePath(worktreePath) == normalisePath(repo.Root) {
		return errors.New("the project itself cannot be removed")
	}
	return repo.RemoveWorktree(a.ctx, worktreePath, force)
}

// RevealPath opens a path in the desktop file manager.
func (a *App) RevealPath(target string) error {
	return reveal.Path(target)
}

func (a *App) checkoutAt(worktreePath string) (*git.Repo, error) {
	if worktreePath == "" {
		return nil, errors.New("no checkout given")
	}
	if _, ok := git.Open(a.ctx, worktreePath); !ok {
		return nil, fmt.Errorf("%s is not a git repository", worktreePath)
	}
	// Open resolves to the main repository for a path inside it; the checkout's
	// own root is what diffs must run against, or an agent's worktree would show
	// the project's changes instead of its own.
	return &git.Repo{Root: normalisePath(worktreePath)}, nil
}
