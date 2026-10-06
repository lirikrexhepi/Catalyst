package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"composer/internal/domain"
	"composer/internal/git"
	"composer/internal/session"
	"composer/internal/skills"
)

type SkillTestInput struct {
	Driver     string                `json:"driver"`
	Prompt     string                `json:"prompt"`
	Files      []domain.FileRef      `json:"files,omitempty"`
	Skills     []string              `json:"skills"`
	Cwd        string                `json:"cwd"`
	Account    string                `json:"account,omitempty"`
	Model      string                `json:"model,omitempty"`
	Options    domain.ModelOptions   `json:"options,omitempty"`
	Permission domain.PermissionMode `json:"permissionMode,omitempty"`
}

func (a *App) ListSkills(cwd string) []skills.Info {
	return skills.List(a.resolveCwd(cwd))
}

func (a *App) StartSkillTest(in SkillTestInput) (session.SpawnResult, error) {
	cwd, err := a.requireCwd(in.Cwd)
	if err != nil {
		return session.SpawnResult{}, err
	}
	prompt := strings.TrimSpace(in.Prompt)
	if prompt == "" && len(in.Files) == 0 {
		return session.SpawnResult{}, fmt.Errorf("write a prompt before starting a skill test")
	}
	if len(in.Skills) == 0 {
		return session.SpawnResult{}, fmt.Errorf("pick at least one skill to test")
	}

	driver := domain.DriverKind(in.Driver)
	if driver == "" {
		driver = domain.DriverClaude
	}
	switch driver {
	case domain.DriverClaude, domain.DriverOpenCode, domain.DriverAntigravity:
	default:
		return session.SpawnResult{}, fmt.Errorf("skill tests run on Claude, OpenCode or Antigravity, not %s", domain.DriverLabel(driver))
	}

	chosen := map[string]bool{}
	for _, name := range in.Skills {
		chosen[name] = true
	}
	var refs []domain.SkillRef
	var denied []string
	for _, info := range skills.List(cwd) {
		if chosen[info.Name] {
			refs = append(refs, domain.SkillRef{Name: info.Name, Path: info.Path})
			delete(chosen, info.Name)
			continue
		}
		denied = append(denied, info.Name)
	}
	for name := range chosen {
		refs = append(refs, domain.SkillRef{Name: name})
	}

	with := session.SpawnRequest{
		Title:  "With skills",
		Prompt: prompt,
		Driver: driver,
		Files:  in.Files,
		Skills: &domain.SkillPolicy{Mode: domain.SkillsOnly, Skills: refs, Denied: denied},
	}
	without := session.SpawnRequest{
		Title:  "No skills",
		Prompt: prompt,
		Driver: driver,
		Files:  in.Files,
		Skills: &domain.SkillPolicy{Mode: domain.SkillsNone},
	}

	_, isRepo := git.Open(a.ctx, cwd)
	if !isRepo {
		root := filepath.Join(cwd, "skill-test-"+time.Now().Format("20060102-150405"))
		with.Cwd = filepath.Join(root, "with-skills")
		without.Cwd = filepath.Join(root, "no-skills")
		for _, dir := range []string{with.Cwd, without.Cwd} {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return session.SpawnResult{}, err
			}
		}
	}

	for _, request := range []*session.SpawnRequest{&with, &without} {
		request.Account = in.Account
		request.Model = in.Model
		request.Options = in.Options
	}

	return a.SpawnTasks([]session.SpawnRequest{with, without}, session.SpawnOptions{
		Driver:      driver,
		Account:     in.Account,
		Model:       in.Model,
		Options:     in.Options,
		Cwd:         cwd,
		UseWorktree: isRepo,
		Title:       "Skill test: " + strings.Join(in.Skills, ", "),
		Prompt:      prompt,
		Permission:  in.Permission,
	})
}
