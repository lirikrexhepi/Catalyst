package main

import (
	"fmt"
	"strings"

	"composer/internal/domain"
	"composer/internal/git"
	"composer/internal/projects"
	"composer/internal/session"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// IsGitRepo reports whether a directory can back worktree isolation, so the UI
// can ask about it only when the answer is meaningful. An empty path means the
// active project; without one, worktree isolation is unavailable.
func (a *App) IsGitRepo(dir string) bool {
	dir = a.resolveCwd(dir)
	if dir == "" {
		return false
	}
	_, ok := git.Open(a.ctx, dir)
	return ok
}

// ListProjects reports every saved project, most recently used first.
func (a *App) ListProjects() []projects.Project {
	return a.projects.List()
}

// ActiveProject reports the project agents currently start in, if any.
func (a *App) ActiveProject() *projects.Project {
	project, ok := a.projects.Active()
	if !ok {
		return nil
	}
	return &project
}

// ChooseProject opens the OS folder picker and saves what was chosen.
//
// Returns nil when the dialog is cancelled: backing out of a file picker is a
// normal thing to do, not an error worth surfacing to the user.
func (a *App) ChooseProject() (*projects.Project, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose a project folder",
	})
	if err != nil {
		return nil, err
	}
	if dir == "" {
		return nil, nil
	}
	return a.AddProject(dir)
}

// AddProject saves a directory by path, for callers that already know it.
//
// Whether the directory is a git repo is resolved here rather than in the
// store, so the projects package stays free of a dependency on git.
func (a *App) AddProject(dir string) (*projects.Project, error) {
	_, isGit := git.Open(a.ctx, dir)
	project, err := a.projects.Add(dir, isGit)
	if err != nil {
		return nil, err
	}
	return &project, nil
}

// SelectProject makes a saved project the one agents start in.
func (a *App) SelectProject(id string) (*projects.Project, error) {
	project, err := a.projects.Activate(id)
	if err != nil {
		return nil, err
	}
	return &project, nil
}

// RemoveProject forgets a project. The directory itself is never touched.
func (a *App) RemoveProject(id string) error {
	return a.projects.Remove(id)
}

func (a *App) GetProjectMemory(cwd string) string {
	if a.memory == nil {
		return ""
	}
	return a.memory.LoadProjectMemory(a.resolveCwd(cwd))
}

func (a *App) SaveProjectMemory(cwd, content string) error {
	if a.memory == nil {
		return fmt.Errorf("memory store not initialized")
	}
	dir := a.resolveCwd(cwd)
	if dir == "" {
		return fmt.Errorf("choose a project folder first")
	}
	return a.memory.SaveProjectMemory(dir, content)
}

func (a *App) GetWorkspaceRecap(workspaceID string) string {
	if a.memory == nil {
		return ""
	}
	return a.memory.LoadRecap(workspaceID)
}

// ContextStatus reports how full a thread's context is, mirroring Zeron's
// context ring (amber 75%, red 90%) and Synara's /status. Chars are the local
// proxy; token usage refines it when the driver reports a context window.
func (a *App) ContextStatus(threadID string) map[string]any {
	events := a.manager.History(threadID)
	chars := 0
	for _, event := range events {
		chars += len(event.Text)
		if event.Tool != nil {
			chars += len(event.Tool.Output)
		}
	}
	usedPercent := float64(chars) / 100000.0 * 100.0
	if usedPercent > 100 {
		usedPercent = 100
	}
	status := "ok"
	if usedPercent >= 90 {
		status = "red"
	} else if usedPercent >= 75 {
		status = "amber"
	}
	needsCompact := len(events) >= 1500 || chars >= 100000
	return map[string]any{
		"events":       len(events),
		"chars":        chars,
		"usedPercent":  usedPercent,
		"status":       status,
		"needsCompact": needsCompact,
	}
}

// CompactWorkspace builds a structured recap of a workspace conversation and
// stores it as RECAP.md, like Synara's recap panel and Cursor's growing shared
// context. Rule-based today (no extra model call); pass llmText from the caller
// when a summarizer turn has produced one to store that instead.
func (a *App) CompactWorkspace(workspaceID, llmText string) (string, error) {
	loaded, err := a.historyStore.Load(workspaceID)
	if err != nil {
		return "", err
	}
	var events []domain.RuntimeEvent
	for _, list := range loaded.Transcripts {
		events = append(events, list...)
	}
	cwd := loaded.Meta.Workspace.Cwd
	recap := strings.TrimSpace(llmText)
	if recap == "" {
		recap = session.RuleFallbackRecap(events, cwd)
	}
	if recap == "" {
		return "", fmt.Errorf("nothing to compact")
	}
	if err := a.memory.SaveRecap(workspaceID, recap); err != nil {
		return "", err
	}
	return recap, nil
}

// RecapPrompt returns the prompt to send to a summarizer turn for a workspace,
// so the frontend (or a background job) can run /compact through any provider.
func (a *App) RecapPrompt(workspaceID string) (string, error) {
	loaded, err := a.historyStore.Load(workspaceID)
	if err != nil {
		return "", err
	}
	var events []domain.RuntimeEvent
	for _, list := range loaded.Transcripts {
		events = append(events, list...)
	}
	return session.BuildRecapPrompt(events, loaded.Meta.Workspace.Cwd), nil
}
