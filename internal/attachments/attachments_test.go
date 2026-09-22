package attachments

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveWritesDecodedBytes(t *testing.T) {
	store := New(t.TempDir())
	payload := base64.StdEncoding.EncodeToString([]byte("hello"))

	saved, err := store.Save("note.txt", "text/plain", payload)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	content, err := os.ReadFile(saved.Path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(content) != "hello" {
		t.Fatalf("got %q, want %q", content, "hello")
	}
	if saved.Size != 5 {
		t.Fatalf("size = %d, want 5", saved.Size)
	}
	if !saved.Temporary {
		t.Fatal("a file Composer wrote must be marked temporary so it can be cleaned up")
	}
}

func TestSaveAcceptsDataURL(t *testing.T) {
	store := New(t.TempDir())
	// Exactly what a clipboard paste produces, so the frontend never unwraps it.
	payload := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("png-bytes"))

	saved, err := store.Save("", "", payload)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.MIME != "image/png" {
		t.Fatalf("mime = %q, want image/png", saved.MIME)
	}
	if filepath.Ext(saved.Path) != ".png" {
		t.Fatalf("expected a .png extension, got %q", saved.Path)
	}
}

func TestSaveRejectsEmptyPayload(t *testing.T) {
	store := New(t.TempDir())
	if _, err := store.Save("empty.png", "image/png", ""); err == nil {
		t.Fatal("expected an empty attachment to be rejected")
	}
}

func TestSaveContainsCraftedNames(t *testing.T) {
	root := t.TempDir()
	store := New(root)
	payload := base64.StdEncoding.EncodeToString([]byte("x"))

	// A traversing name must not place the file outside the scratch directory.
	saved, err := store.Save(`..\..\escaped.txt`, "text/plain", payload)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	if filepath.Dir(saved.Path) != filepath.Clean(root) {
		t.Fatalf("attachment escaped its directory: %q", saved.Path)
	}
	if strings.Contains(saved.Name, "..") {
		t.Fatalf("sanitised name still contains traversal: %q", saved.Name)
	}
}

func TestDiscardRemovesOnlyOwnedFiles(t *testing.T) {
	store := New(t.TempDir())

	// A file Composer wrote: deleting it is correct.
	saved, err := store.Save("temp.txt", "text/plain",
		base64.StdEncoding.EncodeToString([]byte("temp")))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	// A file the user owns: it must survive being removed from the composer.
	userFile := filepath.Join(t.TempDir(), "mine.txt")
	if err := os.WriteFile(userFile, []byte("mine"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	adopted, err := store.Adopt(userFile)
	if err != nil {
		t.Fatalf("Adopt: %v", err)
	}

	store.Discard(saved.ID)
	store.Discard(adopted.ID)

	if _, err := os.Stat(saved.Path); !os.IsNotExist(err) {
		t.Fatal("a staged file should have been deleted")
	}
	if _, err := os.Stat(userFile); err != nil {
		t.Fatalf("the user's own file must never be deleted: %v", err)
	}
}

func TestAdoptReferencesFileInPlace(t *testing.T) {
	store := New(t.TempDir())
	userFile := filepath.Join(t.TempDir(), "shot.png")
	if err := os.WriteFile(userFile, []byte("png"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	adopted, err := store.Adopt(userFile)
	if err != nil {
		t.Fatalf("Adopt: %v", err)
	}
	if adopted.Path != filepath.Clean(userFile) {
		t.Fatalf("adopted path should be the original, got %q", adopted.Path)
	}
	if adopted.Temporary {
		t.Fatal("a user's own file must not be marked temporary")
	}
	if adopted.MIME != "image/png" {
		t.Fatalf("mime = %q, want image/png", adopted.MIME)
	}
}

func TestAdoptRejectsDirectory(t *testing.T) {
	store := New(t.TempDir())
	if _, err := store.Adopt(t.TempDir()); err == nil {
		t.Fatal("expected adopting a directory to fail")
	}
}

func TestCleanupRemovesEveryStagedFile(t *testing.T) {
	store := New(t.TempDir())
	payload := base64.StdEncoding.EncodeToString([]byte("data"))

	first, _ := store.Save("a.txt", "text/plain", payload)
	second, _ := store.Save("b.txt", "text/plain", payload)

	store.Cleanup()

	for _, path := range []string{first.Path, second.Path} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%q survived cleanup", path)
		}
	}
}

func TestSavedNamesDoNotCollide(t *testing.T) {
	store := New(t.TempDir())
	payload := base64.StdEncoding.EncodeToString([]byte("x"))

	// Two pastes of the same screenshot name must not overwrite each other.
	first, err := store.Save("image.png", "image/png", payload)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	second, err := store.Save("image.png", "image/png", payload)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	if first.Path == second.Path {
		t.Fatalf("two attachments landed on the same path: %q", first.Path)
	}
}

func TestPreviewReturnsDataURLForImages(t *testing.T) {
	store := New(t.TempDir())
	saved, err := store.Save("shot.png", "image/png",
		base64.StdEncoding.EncodeToString([]byte("fake-png")))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	preview, err := store.Preview(saved.Path)
	if err != nil {
		t.Fatalf("Preview: %v", err)
	}
	if !strings.HasPrefix(preview, "data:image/png;base64,") {
		t.Fatalf("unexpected preview prefix: %.40s", preview)
	}

	encoded := strings.TrimPrefix(preview, "data:image/png;base64,")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("decode preview: %v", err)
	}
	if string(decoded) != "fake-png" {
		t.Fatalf("preview round-trip changed the bytes: %q", decoded)
	}
}

func TestPreviewRejectsNonImages(t *testing.T) {
	store := New(t.TempDir())
	saved, err := store.Save("notes.txt", "text/plain",
		base64.StdEncoding.EncodeToString([]byte("text")))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	// The composer falls back to an icon rather than rendering a broken image.
	if _, err := store.Preview(saved.Path); err == nil {
		t.Fatal("expected a non-image to be refused")
	}
}
