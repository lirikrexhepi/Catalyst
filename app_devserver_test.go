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
