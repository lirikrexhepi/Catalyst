package projects

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestProjectDefaultAccountAppliesInsideTheProject(t *testing.T) {
	dir := t.TempDir()
	root := t.TempDir()
	nested := filepath.Join(root, "src")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	other := t.TempDir()

	store := New(dir)
	project, err := store.Add(root, true)
	if err != nil {
		t.Fatal(err)
	}
	if got := store.AccountFor(root, "claude"); got != "" {
		t.Fatalf("no default set yet, got %q", got)
	}
	if _, err := store.SetAccount(project.ID, "claude", "personal"); err != nil {
		t.Fatal(err)
	}

	reopened := New(dir)
	if got := reopened.AccountFor(root, "claude"); got != "personal" {
		t.Fatalf("project default lost across restart: %q", got)
	}
	if got := reopened.AccountFor(nested, "claude"); got != "personal" {
		t.Fatalf("folders inside the project should inherit, got %q", got)
	}
	if got := reopened.AccountFor(other, "claude"); got != "" {
		t.Fatalf("other folders must not inherit, got %q", got)
	}
	if got := reopened.AccountFor(root, "opencode"); got != "" {
		t.Fatalf("defaults are per CLI, got %q", got)
	}
	if list := reopened.List(); len(list) != 1 || list[0].Accounts["claude"] != "personal" {
		t.Fatalf("listed project should carry its accounts: %+v", list)
	}

	if _, err := reopened.SetAccount(project.ID, "claude", ""); err != nil {
		t.Fatal(err)
	}
	if got := reopened.AccountFor(root, "claude"); got != "" {
		t.Fatalf("clearing the default should restore the implicit one, got %q", got)
	}
	if _, err := reopened.SetAccount("missing", "claude", "personal"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown project: %v", err)
	}
}
