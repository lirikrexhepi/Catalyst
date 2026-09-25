package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"composer/internal/domain"
	"composer/internal/files"
	"composer/internal/git"
)

// ProjectTree lists one folder of the explorer. root is the checkout being
// viewed (the project, or an agent's worktree); empty means the active
// project. dir is relative to root, empty for the top level.
func (a *App) ProjectTree(root, dir string) ([]files.Entry, error) {
	return a.projectTree(a.ctx, root, dir)
}

// ProjectTreeStatus reports the git decorations for the explorer at root.
func (a *App) ProjectTreeStatus(root string) (files.TreeStatus, error) {
	return a.projectTreeStatus(a.ctx, root)
}

// ProjectFile returns a file's text for the read-only preview.
func (a *App) ProjectFile(root, path string) (files.Content, error) {
	return a.projectFile(a.ctx, root, path)
}

func (a *App) projectTree(ctx context.Context, root, dir string) ([]files.Entry, error) {
	root, err := a.treeRoot(ctx, root)
	if err != nil {
		return nil, err
	}
	entries, err := files.List(root, dir)
	if err != nil {
		return nil, err
	}

	// Ignored entries are dimmed rather than hidden, as in VS Code: build
	// output and dependencies are still worth being able to open.
	paths := make([]string, len(entries))
	for i, entry := range entries {
		paths[i] = entry.Path
		if entry.Dir {
			// Folder-only patterns such as "dist/" match only with the slash.
			paths[i] += "/"
		}
	}
	ignored := git.Ignored(ctx, root, paths)
	for i := range entries {
		entries[i].Ignored = ignored[entries[i].Path]
	}
	return entries, nil
}

func (a *App) projectTreeStatus(ctx context.Context, root string) (files.TreeStatus, error) {
	root, err := a.treeRoot(ctx, root)
	if err != nil {
		return files.TreeStatus{}, err
	}
	empty := files.TreeStatus{Files: map[string]domain.ChangeStatus{}, Dirs: map[string]domain.ChangeStatus{}}

	repo, ok := git.Open(ctx, root)
	if !ok {
		return empty, nil
	}
	changes, err := (&git.Repo{Root: repo.Root}).Status(ctx)
	if err != nil {
		return empty, err
	}

	// The tree can be opened below the repository root (a project that is one
	// folder of a monorepo); git reports paths from the root.
	prefix := ""
	if rel, err := filepath.Rel(repo.Root, root); err == nil && rel != "." {
		prefix = filepath.ToSlash(rel)
	}
	status := files.Decorate(changes, prefix)
	status.RepoRoot = repo.Root
	return status, nil
}

func (a *App) projectFile(ctx context.Context, root, path string) (files.Content, error) {
	root, err := a.treeRoot(ctx, root)
	if err != nil {
		return files.Content{}, err
	}
	return files.Read(root, path, files.DefaultReadLimit)
}

// treeRoot resolves which folder an explorer may open. Anything reachable
// from the phone ends up here, so it is held to what the app already works
// on: a saved project (or a folder inside one), the repository a project
// lives in, or a worktree the app created for an agent.
func (a *App) treeRoot(ctx context.Context, requested string) (string, error) {
	root := a.resolveCwd(requested)
	if root == "" {
		return "", errors.New("choose a project first")
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		return "", fmt.Errorf("folder is unavailable: %s", root)
	}
	if a.isKnownRoot(ctx, root) {
		return root, nil
	}
	return "", fmt.Errorf("%s is not a project folder", root)
}

func (a *App) isKnownRoot(ctx context.Context, root string) bool {
	if base, err := worktreeBase(); err == nil && underDir(root, base) {
		return true
	}
	if a.projects == nil {
		return false
	}
	for _, project := range a.projects.List() {
		if underDir(root, project.Path) {
			return true
		}
		// The repository root above a project is the main checkout's lane.
		if underDir(project.Path, root) {
			if repo, ok := git.Open(ctx, project.Path); ok && samePath(repo.Root, root) {
				return true
			}
		}
	}
	return false
}

// worktreeBase is the folder every agent worktree is created under.
func worktreeBase() (string, error) {
	sample, err := git.WorktreeRoot("x")
	if err != nil {
		return "", err
	}
	return filepath.Dir(sample), nil
}

func samePath(left, right string) bool {
	return strings.EqualFold(filepath.Clean(left), filepath.Clean(right))
}

// underDir reports whether path is dir or inside it, without case, since
// Windows paths arrive from git, the store and the UI in different casings.
func underDir(path, dir string) bool {
	path, dir = strings.ToLower(filepath.Clean(path)), strings.ToLower(filepath.Clean(dir))
	if path == dir {
		return true
	}
	if !strings.HasSuffix(dir, string(filepath.Separator)) {
		dir += string(filepath.Separator)
	}
	return strings.HasPrefix(path, dir)
}
