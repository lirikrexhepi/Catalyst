package git

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// WorktreeRoot is where isolated checkouts live: under the user's app data
// rather than beside the project, so working on many repos never litters their
// folders. Each repo gets its own subdirectory, suffixed with a hash of the
// absolute path so identically named projects cannot collide.
func WorktreeRoot(repoRoot string) (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}

	absolute, err := filepath.Abs(repoRoot)
	if err != nil {
		absolute = repoRoot
	}
	sum := sha256.Sum256([]byte(strings.ToLower(filepath.Clean(absolute))))
	name := filepath.Base(absolute) + "-" + hex.EncodeToString(sum[:4])

	return filepath.Join(base, "catalyst", "worktrees", name), nil
}

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// Slug converts a task title into a branch-safe identifier.
func Slug(title string) string {
	slug := slugPattern.ReplaceAllString(strings.ToLower(title), "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "task"
	}
	if len(slug) > 40 {
		slug = strings.Trim(slug[:40], "-")
	}
	return slug
}

// UniqueBranch appends a numeric suffix until the branch name is free, so two
// tasks with similar titles cannot clash.
func (r *Repo) UniqueBranch(prefix, slug string) string {
	candidate := prefix + slug
	for attempt := 2; r.branchExists(candidate); attempt++ {
		candidate = prefix + slug + "-" + itoa(attempt)
	}
	return candidate
}

func (r *Repo) branchExists(branch string) bool {
	cmd := command(r.Root, "rev-parse", "--verify", "--quiet", "refs/heads/"+branch)
	return cmd.Run() == nil
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	var digits []byte
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
