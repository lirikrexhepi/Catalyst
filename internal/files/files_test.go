package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveRefusesEscapes(t *testing.T) {
	root := t.TempDir()
	for _, rel := range []string{"../x", "a/../../x", "/etc/passwd"} {
		if path, err := Resolve(root, rel); err == nil && !within(path, root) {
			t.Fatalf("%q resolved outside root to %s", rel, path)
		}
	}
	if _, err := Resolve(root, "../outside"); err == nil {
		t.Fatal("expected ../outside to be refused")
	}
	if got, err := Resolve(root, "src/app.go"); err != nil || got != filepath.Join(root, "src", "app.go") {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestListOrdersFoldersFirstAndHidesGit(t *testing.T) {
	root := t.TempDir()
	must(t, os.MkdirAll(filepath.Join(root, ".git"), 0o755))
	must(t, os.MkdirAll(filepath.Join(root, "src", "ui"), 0o755))
	must(t, os.WriteFile(filepath.Join(root, "b.txt"), []byte("b"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "A.md"), []byte("a"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, ".env"), []byte("x"), 0o644))

	entries, err := List(root, "")
	must(t, err)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name)
	}
	want := []string{"src", ".env", "A.md", "b.txt"}
	if len(names) != len(want) {
		t.Fatalf("got %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("got %v, want %v", names, want)
		}
	}

	nested, err := List(root, "src")
	must(t, err)
	if len(nested) != 1 || nested[0].Path != "src/ui" || !nested[0].Dir {
		t.Fatalf("nested listing = %+v", nested)
	}
}

func TestReadTextBinaryAndTruncation(t *testing.T) {
	root := t.TempDir()
	must(t, os.WriteFile(filepath.Join(root, "t.txt"), []byte("one\r\ntwo\n"), 0o644))
	must(t, os.WriteFile(filepath.Join(root, "b.bin"), []byte{1, 0, 2}, 0o644))

	text, err := Read(root, "t.txt", 0)
	must(t, err)
	if text.Binary || text.Text != "one\ntwo\n" || text.Truncated {
		t.Fatalf("text = %+v", text)
	}
	bin, err := Read(root, "b.bin", 0)
	must(t, err)
	if !bin.Binary || bin.Text != "" {
		t.Fatalf("binary = %+v", bin)
	}
	cut, err := Read(root, "t.txt", 5)
	must(t, err)
	if !cut.Truncated || cut.Text != "one\n" {
		t.Fatalf("cut = %+v", cut)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
