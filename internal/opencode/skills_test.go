package opencode

import (
	"strings"
	"testing"

	"composer/internal/domain"
)

func TestApplySkills(t *testing.T) {
	none := PromptRequest{System: "base"}
	applySkills(&none, &domain.SkillPolicy{Mode: domain.SkillsNone})
	if none.Tools["skill"] != false || len(none.Tools) != 1 || none.System != "base" {
		t.Fatalf("no-skills must switch off the skill tool only, got %+v", none)
	}
	only := PromptRequest{System: "base"}
	applySkills(&only, &domain.SkillPolicy{Mode: domain.SkillsOnly, Skills: []domain.SkillRef{{Name: "performant-glass"}}})
	if only.Tools != nil || !strings.HasPrefix(only.System, "base\n\nBefore you start") || !strings.Contains(only.System, "performant-glass") {
		t.Fatalf("skills run must add the instruction, got %+v", only)
	}
	plain := PromptRequest{System: "base"}
	applySkills(&plain, nil)
	if plain.Tools != nil || plain.System != "base" {
		t.Fatal("regular prompts must be unchanged")
	}
}
