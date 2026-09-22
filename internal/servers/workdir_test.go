package servers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInferWorkdirFindsProjectAboveNodeModules(t *testing.T) {
	root := t.TempDir()
	project := filepath.Join(root, "configurator")
	binDir := filepath.Join(project, "node_modules", "vite", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(project, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	command := `"node" "` + filepath.Join(binDir, "vite.js") + `"`
	if got := InferWorkdir(command); got != project {
		t.Errorf("InferWorkdir = %q, want %q", got, project)
	}
}

func TestInferWorkdirSeparatesTwoProjectsOnOnePort(t *testing.T) {
	root := t.TempDir()
	first := filepath.Join(root, "app-a")
	second := filepath.Join(root, "app-b")
	for _, project := range []string{first, second} {
		if err := os.MkdirAll(filepath.Join(project, "node_modules", "vite", "bin"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(project, "package.json"), []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	a := InferWorkdir(`"node" "` + filepath.Join(first, "node_modules", "vite", "bin", "vite.js") + `"`)
	b := InferWorkdir(`"node" "` + filepath.Join(second, "node_modules", "vite", "bin", "vite.js") + `"`)
	if a == b {
		t.Fatalf("both projects inferred to %q", a)
	}
	if a != first || b != second {
		t.Errorf("got %q and %q, want %q and %q", a, b, first, second)
	}
}

func TestInferWorkdirEmptyWhenNoProjectOnDisk(t *testing.T) {
	if got := InferWorkdir(`"node" "C:\definitely\not\here\server.js"`); got != "" {
		t.Errorf("InferWorkdir = %q, want empty", got)
	}
	if got := InferWorkdir("agy.exe --print hello"); got != "" {
		t.Errorf("InferWorkdir = %q, want empty", got)
	}
}
