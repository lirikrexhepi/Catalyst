package antigravity

import (
	"strings"
	"testing"

	"composer/internal/domain"
)

func TestSkillPolicyArgs(t *testing.T) {
	a := &Adapter{}
	none := strings.Join(a.buildArgs(&session{skills: &domain.SkillPolicy{Mode: domain.SkillsNone}}, "build a site"), "\x00")
	if !strings.Contains(none, "--disable-slash-commands") {
		t.Fatal("a no-skills run must disable skills")
	}
	only := &session{skills: &domain.SkillPolicy{Mode: domain.SkillsOnly, Skills: []domain.SkillRef{{Name: "spacious-minimal", Path: `C:\skills\spacious-minimal`}}}}
	args := a.buildArgs(only, "build a site")
	if !strings.HasPrefix(args[1], "Before you start, load each of these skills") || !strings.Contains(args[1], `spacious-minimal (C:\skills\spacious-minimal`) || !strings.HasSuffix(args[1], "build a site") {
		t.Fatalf("first prompt must lead with the skill instruction, got %q", args[1])
	}
	only.conversationID = "conv-1"
	if later := a.buildArgs(only, "next"); later[1] != "next" {
		t.Fatalf("follow-up turns must not repeat the instruction, got %q", later[1])
	}
	if strings.Contains(strings.Join(a.buildArgs(&session{}, "hi"), "\x00"), "--disable-slash-commands") {
		t.Fatal("regular runs must keep skills")
	}
}
