package claude

import (
	"strings"
	"testing"

	"composer/internal/domain"
)

func TestSkillPolicyNoneDisablesSkills(t *testing.T) {
	a := NewAdapter(domain.ProviderSettings{}, &captureEmitter{})
	args := strings.Join(a.buildArgs(domain.SessionStartInput{Skills: &domain.SkillPolicy{Mode: domain.SkillsNone}}), "\x00")
	if !strings.Contains(args, "--disable-slash-commands") {
		t.Fatal("a no-skills session must disable skills")
	}
	if strings.Contains(args, "--append-system-prompt") || strings.Contains(args, "Skill(") {
		t.Fatal("a no-skills session must not mention skills")
	}
}

func TestSkillPolicyOnlyDeniesOthers(t *testing.T) {
	a := NewAdapter(domain.ProviderSettings{}, &captureEmitter{})
	policy := &domain.SkillPolicy{Mode: domain.SkillsOnly, Skills: []domain.SkillRef{{Name: "spacious-minimal"}}, Denied: []string{"apple-design", "animate"}}
	args := strings.Join(a.buildArgs(domain.SessionStartInput{Skills: policy}), "\x00")
	for _, want := range []string{`"deny":["Skill(apple-design)","Skill(animate)"]`, "--append-system-prompt\x00Before you start, load each of these skills", "spacious-minimal."} {
		if !strings.Contains(args, want) {
			t.Errorf("args missing %q", strings.ReplaceAll(want, "\x00", " "))
		}
	}
	if strings.Contains(args, "--disable-slash-commands") {
		t.Fatal("a skills session must keep skills enabled")
	}
}

func TestNoPolicyLeavesSkillsAlone(t *testing.T) {
	a := NewAdapter(domain.ProviderSettings{}, &captureEmitter{})
	args := strings.Join(a.buildArgs(domain.SessionStartInput{}), "\x00")
	if strings.Contains(args, "--disable-slash-commands") || strings.Contains(args, "Skill(") {
		t.Fatal("regular sessions must not change skill access")
	}
}
