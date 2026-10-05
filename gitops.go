package main

import "composer/internal/domain"

func (a *App) GitStage(worktreePath string, files []string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Stage(a.ctx, files)
}

func (a *App) GitUnstage(worktreePath string, files []string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Unstage(a.ctx, files)
}

func (a *App) GitCommit(worktreePath, summary, description string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Commit(a.ctx, summary, description)
}

func (a *App) GitBranches(worktreePath string) ([]domain.BranchInfo, error) {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return nil, err
	}
	return repo.Branches(a.ctx)
}

func (a *App) GitCheckout(worktreePath, branch, mode string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Checkout(a.ctx, branch, mode)
}

func (a *App) GitCreateBranch(worktreePath, name string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.CreateBranch(a.ctx, name)
}

func (a *App) GitFetch(worktreePath string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Fetch(a.ctx)
}

func (a *App) GitPull(worktreePath string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Pull(a.ctx)
}

func (a *App) GitPush(worktreePath string) error {
	repo, err := a.checkoutAt(worktreePath)
	if err != nil {
		return err
	}
	return repo.Push(a.ctx)
}
