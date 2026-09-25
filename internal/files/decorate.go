package files

import (
	"strings"

	"composer/internal/domain"
)

// TreeStatus is what the explorer paints: each changed file's status and, for
// every folder above one, the strongest status beneath it, the way VS Code
// colours a folder that holds changes.
type TreeStatus struct {
	IsGit bool `json:"isGit"`
	// RepoRoot and Prefix map a tree path back to the path git uses: git paths
	// are relative to the repository, the tree to the folder it was opened at.
	RepoRoot string                         `json:"repoRoot,omitempty"`
	Prefix   string                         `json:"prefix,omitempty"`
	Files    map[string]domain.ChangeStatus `json:"files"`
	// Staged lists files whose only change is staged, which the diff view
	// needs to know to ask for the right side.
	Staged map[string]bool                `json:"staged,omitempty"`
	Dirs   map[string]domain.ChangeStatus `json:"dirs"`
}

// rank orders statuses by how much they matter at a glance. A folder shows
// its highest-ranked child, so one conflict is never hidden behind new files.
func rank(status domain.ChangeStatus) int {
	switch status {
	case domain.ChangeConflicted:
		return 5
	case domain.ChangeDeleted:
		return 4
	case domain.ChangeModified, domain.ChangeRenamed, domain.ChangeCopied:
		return 3
	case domain.ChangeAdded:
		return 2
	case domain.ChangeUntracked:
		return 1
	}
	return 0
}

// folderStatus is what a folder shows: it is "modified" when anything in it
// changed, and only takes the new-file colour when everything in it is new.
func folderStatus(status domain.ChangeStatus) domain.ChangeStatus {
	switch status {
	case domain.ChangeConflicted, domain.ChangeUntracked, domain.ChangeAdded:
		return status
	}
	return domain.ChangeModified
}

// Decorate turns git's changed files into explorer decorations for a tree
// opened at prefix (slash-separated, relative to the repository root; empty
// when the tree is the repository itself). Changes outside prefix are dropped.
func Decorate(changes []domain.FileChange, prefix string) TreeStatus {
	prefix = strings.Trim(prefix, "/")
	status := TreeStatus{
		IsGit:  true,
		Prefix: prefix,
		Files:  make(map[string]domain.ChangeStatus),
		Staged: make(map[string]bool),
		Dirs:   make(map[string]domain.ChangeStatus),
	}

	// A file can be listed twice, staged and unstaged. The working-tree side
	// is what is on disk now, so it wins; the staged side only fills a gap.
	unstaged := make(map[string]bool)
	for _, change := range changes {
		path := change.Path
		if prefix != "" {
			if !strings.HasPrefix(path, prefix+"/") {
				continue
			}
			path = strings.TrimPrefix(path, prefix+"/")
		}

		current, seen := status.Files[path]
		switch {
		case !seen:
			status.Files[path] = change.Status
		case !change.Staged && (!unstaged[path] || rank(change.Status) > rank(current)):
			status.Files[path] = change.Status
		case change.Staged && !unstaged[path] && rank(change.Status) > rank(current):
			status.Files[path] = change.Status
		}
		if change.Staged {
			if !unstaged[path] {
				status.Staged[path] = true
			}
		} else {
			unstaged[path] = true
			delete(status.Staged, path)
		}
	}

	for path, fileStatus := range status.Files {
		mark := folderStatus(fileStatus)
		for dir := parentOf(path); dir != ""; dir = parentOf(dir) {
			if existing, ok := status.Dirs[dir]; !ok || rank(mark) > rank(existing) {
				status.Dirs[dir] = mark
			}
		}
	}
	return status
}

func parentOf(path string) string {
	if cut := strings.LastIndex(path, "/"); cut > 0 {
		return path[:cut]
	}
	return ""
}
