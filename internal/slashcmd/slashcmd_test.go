package slashcmd

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListIncludesClaudeBuiltinsAndProjectCommands(t *testing.T) {
	cwd := t.TempDir()
	dir := filepath.Join(cwd, ".claude", "commands", "git")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := "---\ndescription: Ship it\n---\nRun the release for $ARGUMENTS"
	if err := os.WriteFile(filepath.Join(dir, "ship.md"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	commands := List("claude", cwd)
	var sawCompact, sawShip bool
	for _, command := range commands {
		if command.Name == "compact" && command.Kind == "builtin" {
			sawCompact = true
		}
		if command.Name == "git:ship" {
			sawShip = true
			if command.Description != "Ship it" || command.Kind != "custom" || command.Source != "project" {
				t.Fatalf("unexpected command %+v", command)
			}
		}
	}
	if !sawCompact || !sawShip {
		t.Fatalf("compact=%v ship=%v in %+v", sawCompact, sawShip, commands)
	}
}

func TestParseTOMLReadsDescriptionAndPrompt(t *testing.T) {
	description, prompt := parseTOML("description = \"Plan it\"\nprompt = \"\"\"\nPlan {{args}}\n\"\"\"\n")
	if description != "Plan it" || prompt != "Plan {{args}}" {
		t.Fatalf("got %q %q", description, prompt)
	}
}

func TestNonClaudeHasNoBuiltins(t *testing.T) {
	for _, command := range List("codex", t.TempDir()) {
		if command.Kind == "builtin" {
			t.Fatalf("unexpected builtin %+v", command)
		}
	}
}
