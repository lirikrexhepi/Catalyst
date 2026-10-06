package main

import (
	"testing"

	"composer/internal/devserver"
	"composer/internal/projects"
)

func TestRequireCwdUsesOnlySelectedOrExplicitProject(t *testing.T) {
	app := &App{projects: projects.New(t.TempDir())}

	if _, err := app.requireCwd(""); err == nil {
		t.Fatal("an empty selection must not fall back to the desktop launch directory")
	}

	selected := t.TempDir()
	if _, err := app.projects.Add(selected, false); err != nil {
		t.Fatalf("add project: %v", err)
	}
	if got, err := app.requireCwd(""); err != nil || got != selected {
		t.Fatalf("active project = %q, %v; want %q", got, err, selected)
	}

	explicit := t.TempDir()
	if got, err := app.requireCwd(explicit); err != nil || got != explicit {
		t.Fatalf("explicit project = %q, %v; want %q", got, err, explicit)
	}
}

func TestManagedRootFindsServerThroughShellWrapper(t *testing.T) {
	roots := map[int]devserver.Snapshot{
		100: {ID: "srv-1", Cwd: `C:\repo`, Status: devserver.StatusRunning, PID: 100},
	}
	parents := map[int]int{
		100: 1,
		200: 100,
		300: 200,
	}

	snapshot, ok := managedRoot(300, roots, parents)
	if !ok {
		t.Fatal("node listener not traced back to its managed shell")
	}
	if snapshot.ID != "srv-1" {
		t.Errorf("id = %q, want srv-1", snapshot.ID)
	}
}

func TestManagedRootIgnoresUnrelatedProcess(t *testing.T) {
	roots := map[int]devserver.Snapshot{100: {ID: "srv-1", PID: 100}}
	parents := map[int]int{999: 1, 100: 1}

	if _, ok := managedRoot(999, roots, parents); ok {
		t.Error("unrelated listener claimed by a managed server")
	}
}

func TestManagedRootSurvivesParentCycle(t *testing.T) {
	roots := map[int]devserver.Snapshot{100: {ID: "srv-1", PID: 100}}
	parents := map[int]int{5: 6, 6: 5}

	if _, ok := managedRoot(5, roots, parents); ok {
		t.Error("cycle produced a bogus match")
	}
}
