package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writePackage(t *testing.T, scripts string) string {
	t.Helper()
	dir := t.TempDir()
	body := `{"name":"x","scripts":` + scripts + `}`
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestDetectDevScriptPrefersDev(t *testing.T) {
	dir := writePackage(t, `{"start":"node server.js","dev":"vite","build":"vite build"}`)
	got, err := detectDevScript(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.script != "dev" || got.manager != "npm" {
		t.Fatalf("got %+v, want npm run dev", got)
	}
}

func TestDetectDevScriptFallsBackToStart(t *testing.T) {
	dir := writePackage(t, `{"start":"next start","build":"next build"}`)
	got, err := detectDevScript(dir)
	if err != nil || got.script != "start" {
		t.Fatalf("got %+v, %v; want start", got, err)
	}
}

func TestDetectDevScriptMissing(t *testing.T) {
	if _, err := detectDevScript(writePackage(t, `{"build":"tsc"}`)); !errors.Is(err, errNoDevScript) {
		t.Fatalf("err = %v, want errNoDevScript", err)
	}
	if _, err := detectDevScript(t.TempDir()); !errors.Is(err, errNoDevScript) {
		t.Fatalf("no package.json: err = %v, want errNoDevScript", err)
	}
}

func writePackageAt(t *testing.T, dir, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDetectDevScriptFindsTheWebAppInAMonorepo(t *testing.T) {
	root := t.TempDir()
	writePackageAt(t, root, `{"name":"mono","private":true,"workspaces":["apps/*","packages/*"]}`)
	writePackageAt(t, filepath.Join(root, "packages", "ui"), `{"scripts":{"dev":"tsc -w"}}`)
	writePackageAt(t, filepath.Join(root, "apps", "api"), `{"scripts":{"dev":"tsx watch src"}}`)
	writePackageAt(t, filepath.Join(root, "apps", "web"), `{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}`)
	writePackageAt(t, filepath.Join(root, "node_modules", "vite"), `{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}`)
	if err := os.WriteFile(filepath.Join(root, "package-lock.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := detectDevScript(root)
	if err != nil {
		t.Fatal(err)
	}
	if !samePath(got.dir, filepath.Join(root, "apps", "web")) || got.script != "dev" || got.manager != "npm" {
		t.Fatalf("got %+v, want npm run dev in apps/web", got)
	}
	if label := devServerLabel(root, got.dir); label != filepath.Base(root)+"/apps/web" {
		t.Fatalf("label = %q", label)
	}
}

func TestDetectDevScriptFindsAFrontendFolder(t *testing.T) {
	root := t.TempDir()
	writePackageAt(t, filepath.Join(root, "frontend"), `{"scripts":{"dev":"next dev"},"dependencies":{"next":"14"}}`)
	got, err := detectDevScript(root)
	if err != nil {
		t.Fatal(err)
	}
	if !samePath(got.dir, filepath.Join(root, "frontend")) {
		t.Fatalf("got %+v, want the frontend folder", got)
	}
}

func TestDetectDevScriptKeepsTheRootScript(t *testing.T) {
	root := writePackage(t, `{"dev":"turbo dev"}`)
	writePackageAt(t, filepath.Join(root, "apps", "web"), `{"scripts":{"dev":"vite"},"devDependencies":{"vite":"^5.0.0"}}`)
	got, err := detectDevScript(root)
	if err != nil || !samePath(got.dir, root) {
		t.Fatalf("got %+v, %v; want the root dev script", got, err)
	}
	if label := devServerLabel(root, got.dir); label != filepath.Base(root) {
		t.Fatalf("label = %q", label)
	}
}
