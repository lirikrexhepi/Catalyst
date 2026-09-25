package files

import (
	"testing"

	"composer/internal/domain"
)

func TestDecorateMarksFilesAndFolders(t *testing.T) {
	changes := []domain.FileChange{
		{Path: "src/ui/panel.ts", Status: domain.ChangeModified},
		{Path: "src/ui/new.ts", Status: domain.ChangeUntracked},
		{Path: "docs/intro.md", Status: domain.ChangeUntracked},
		{Path: "src/app.go", Status: domain.ChangeAdded, Staged: true},
		{Path: "src/app.go", Status: domain.ChangeModified},
		{Path: "src/staged.go", Status: domain.ChangeModified, Staged: true},
		{Path: "other/x.go", Status: domain.ChangeDeleted},
	}
	got := Decorate(changes, "")

	if got.Files["src/ui/panel.ts"] != domain.ChangeModified || got.Files["src/ui/new.ts"] != domain.ChangeUntracked {
		t.Fatalf("files = %v", got.Files)
	}
	if got.Files["src/app.go"] != domain.ChangeModified || got.Staged["src/app.go"] {
		t.Fatalf("working tree side should win for src/app.go: %v staged=%v", got.Files["src/app.go"], got.Staged)
	}
	if !got.Staged["src/staged.go"] {
		t.Fatalf("src/staged.go should be staged-only")
	}
	if got.Dirs["src"] != domain.ChangeModified || got.Dirs["src/ui"] != domain.ChangeModified {
		t.Fatalf("dirs = %v", got.Dirs)
	}
	if got.Dirs["docs"] != domain.ChangeUntracked {
		t.Fatalf("a folder of only new files should show as new, got %v", got.Dirs["docs"])
	}
	if got.Dirs["other"] != domain.ChangeModified {
		t.Fatalf("a folder with a deleted file is modified, got %v", got.Dirs["other"])
	}
}

func TestDecorateScopesToPrefix(t *testing.T) {
	got := Decorate([]domain.FileChange{
		{Path: "apps/web/src/a.ts", Status: domain.ChangeModified},
		{Path: "apps/api/b.go", Status: domain.ChangeModified},
	}, "apps/web")
	if len(got.Files) != 1 || got.Files["src/a.ts"] != domain.ChangeModified {
		t.Fatalf("files = %v", got.Files)
	}
	if got.Dirs["src"] != domain.ChangeModified {
		t.Fatalf("dirs = %v", got.Dirs)
	}
}
