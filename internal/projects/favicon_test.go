package projects

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestFindLinkRelIcon(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "public", "app.png"), "PNGDATA")
	writeFile(t, filepath.Join(root, "index.html"),
		`<html><head><link rel="icon" href="/app.png"></head></html>`)

	data, ctype, err := Find(root)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if string(data) != "PNGDATA" || ctype != "image/png" {
		t.Fatalf("got %q %q", data, ctype)
	}
}

func TestFindPrefersExactIconOverShortcut(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "first.ico"), "FIRST")
	writeFile(t, filepath.Join(root, "second.ico"), "SECOND")
	writeFile(t, filepath.Join(root, "index.html"),
		`<html><head><link rel="shortcut icon" href="second.ico"><link rel="icon" href="first.ico"></head></html>`)

	data, _, err := Find(root)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if string(data) != "FIRST" {
		t.Fatalf("got %q, want FIRST", data)
	}
}

func TestFindManifestIcons(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "icons", "big.png"), "BIG")
	writeFile(t, filepath.Join(root, "icons", "small.png"), "SMALL")
	writeFile(t, filepath.Join(root, "manifest.webmanifest"),
		`{"icons":[{"src":"icons/small.png","sizes":"48x48"},{"src":"icons/big.png","sizes":"192x192"}]}`)

	data, _, err := Find(root)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if string(data) != "BIG" {
		t.Fatalf("got %q, want BIG", data)
	}
}

func TestFindWellKnownFallback(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "public", "favicon.ico"), "ICON")

	data, ctype, err := Find(root)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if string(data) != "ICON" || ctype != "image/x-icon" {
		t.Fatalf("got %q %q", data, ctype)
	}
}

func TestFindNone(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "main.go"), "package main")

	if _, _, err := Find(root); err != ErrNoFavicon {
		t.Fatalf("got %v, want ErrNoFavicon", err)
	}
}

func TestFindRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "index.html"),
		`<html><head><link rel="icon" href="../../secret.ico"></head></html>`)

	if _, _, err := Find(root); err != ErrNoFavicon {
		t.Fatalf("got %v, want ErrNoFavicon", err)
	}
}

func TestFindRejectsRemote(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "index.html"),
		`<html><head><link rel="icon" href="https://example.com/icon.png"></head></html>`)

	if _, _, err := Find(root); err != ErrNoFavicon {
		t.Fatalf("got %v, want ErrNoFavicon", err)
	}
}
