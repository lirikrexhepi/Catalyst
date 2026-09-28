package skills

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestListReadsEveryAgentsSkills(t *testing.T) {
	config := t.TempDir()
	home := t.TempDir()
	project := t.TempDir()
	t.Setenv("CLAUDE_CONFIG_DIR", config)
	t.Setenv("USERPROFILE", home)
	t.Setenv("HOME", home)
	write(t, filepath.Join(config, "skills", "glass", "SKILL.md"), "---\nname: performant-glass\ndescription: Cheap glass.\n---\nbody")
	write(t, filepath.Join(config, "skills", "folded", "SKILL.md"), "---\nname: folded\ndescription: >\n  First line\n  second line\n---\n")
	write(t, filepath.Join(config, "skills", "notes", "README.md"), "not a skill")
	write(t, filepath.Join(home, ".gemini", "config", "skills", "lirik-skills", "morph", "SKILL.md"), "---\nname: morphing-actions\n---\n")
	write(t, filepath.Join(home, ".config", "opencode", "skill", "oc", "SKILL.md"), "---\nname: opencode-only\n---\n")
	write(t, filepath.Join(project, ".claude", "skills", "site", "SKILL.md"), "---\ndescription: \"Project one\"\n---\n")
	write(t, filepath.Join(project, ".agents", "skills", "agy", "SKILL.md"), "---\nname: agy-project\n---\n")

	got := List(project)
	byName := map[string]Info{}
	for _, info := range got {
		byName[info.Name] = info
	}
	if len(got) != 6 {
		t.Fatalf("got %d skills, want 6: %+v", len(got), got)
	}
	if byName["performant-glass"].Description != "Cheap glass." || byName["performant-glass"].Source != "user" {
		t.Errorf("claude skill parsed wrong: %+v", byName["performant-glass"])
	}
	if byName["folded"].Description != "First line second line" {
		t.Errorf("folded description parsed wrong: %q", byName["folded"].Description)
	}
	if byName["morphing-actions"].Path != filepath.Join(home, ".gemini", "config", "skills", "lirik-skills", "morph") {
		t.Errorf("nested antigravity collection not found: %+v", byName["morphing-actions"])
	}
	if byName["opencode-only"].Source != "user" {
		t.Errorf("opencode skill not found: %+v", byName["opencode-only"])
	}
	if byName["site"].Source != "project" || byName["site"].Description != "Project one" {
		t.Errorf("project skill parsed wrong: %+v", byName["site"])
	}
	if byName["agy-project"].Source != "project" {
		t.Errorf("antigravity project skill not found: %+v", byName["agy-project"])
	}
}
