package main

import (
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"composer/internal/claudeimport"
	"composer/internal/domain"
	"composer/internal/session"

)

// ListClaudeCodeSessions reports Claude Code conversations found on this
// machine, newest first. Powers the import picker; reads transcripts only.
func (a *App) ListClaudeCodeSessions() ([]claudeimport.ExternalSession, error) {
	sessions, err := claudeimport.List()
	if err != nil {
		return nil, err
	}
	if sessions == nil {
		return []claudeimport.ExternalSession{}, nil
	}
	return sessions, nil
}

// ImportClaudeCodeSession brings one outside Claude Code transcript into
// history as a read-only workspace.
//
// The imported task stores no provider session id, so resuming it starts a
// fresh CLI in the same directory rather than continuing the outside
// conversation. Fresh agents read the transcript through SpawnFromImported,
// which carries it as prompt context.
func (a *App) ImportClaudeCodeSession(filePath string) (string, error) {
	cleaned, err := filepath.Abs(strings.TrimSpace(filePath))
	if err != nil || cleaned == "" {
		return "", fmt.Errorf("invalid transcript path")
	}
	root, err := filepath.Abs(claudeimport.ProjectsDir())
	if err != nil || root == "" {
		return "", fmt.Errorf("Claude Code history is unavailable on this machine")
	}
	if !strings.HasSuffix(strings.ToLower(cleaned), ".jsonl") || !isWithinDir(root, cleaned) {
		return "", fmt.Errorf("transcript must be a .jsonl file inside %s", root)
	}

	parsed, err := claudeimport.ParseFile(cleaned)
	if err != nil {
		return "", fmt.Errorf("read transcript: %w", err)
	}
	if len(parsed.Events) == 0 {
		return "", fmt.Errorf("transcript holds no conversation")
	}

	cwd := parsed.Cwd
	if strings.TrimSpace(cwd) == "" {
		if wd := a.resolveCwd(""); wd != "" {
			cwd = wd
		} else {
			cwd = cleaned
		}
	}

	workspace := a.workspaces.Create(parsed.Title, parsed.Prompt, cwd)
	workspace.ImportedFrom = "claude-code"
	threadID := "import-" + compactID(parsed.SessionID) + "-" + strconv.FormatInt(time.Now().UnixMilli(), 36)
	task, ok := a.workspaces.AddTask(workspace.ID, domain.Task{
		ThreadID: threadID,
		Title:    parsed.Title,
		Prompt:   parsed.Prompt,
		Driver:   domain.DriverClaude,
		Model:    parsed.Model,
		State:    domain.TaskComplete,
	})
	if !ok {
		return "", fmt.Errorf("workspace %s is gone", workspace.ID)
	}

	a.recorder.OpenWorkspace(*workspace, "")
	a.recorder.TrackTask(*task)

	notice := domain.RuntimeEvent{
		Kind:     domain.EventNotice,
		ThreadID: threadID,
		Driver:   domain.DriverClaude,
		At:       parsed.StartedAt,
		Text:     fmt.Sprintf("Imported from Claude Code session %s. New agents start fresh here with this transcript as context.", parsed.SessionID),
	}
	_ = a.historyStore.Append(workspace.ID, threadID, notice)
	for _, event := range parsed.Events {
		event.ThreadID = threadID
		_ = a.historyStore.Append(workspace.ID, threadID, event)
	}
	_ = a.historyStore.Flush(workspace.ID)
	a.recorder.Touch(workspace.ID, parsed.UpdatedAt)

	return workspace.ID, nil
}

// SpawnFromImported starts a fresh agent in an imported workspace with the
// old transcript carried as prompt context.
//
// The new task joins the same workspace, so the read-only import and the live
// agent that continues its work reopen as one session. Context rides in the
// preamble: the transcript shows only the user's message while the model
// receives both.
func (a *App) SpawnFromImported(workspaceID, prompt, driver, model string, options domain.ModelOptions) (session.SpawnResult, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return session.SpawnResult{}, fmt.Errorf("prompt is required")
	}
	loaded, err := a.historyStore.Load(workspaceID)
	if err != nil {
		return session.SpawnResult{}, err
	}
	cwd, err := a.requireCwd(loaded.Meta.Workspace.Cwd)
	if err != nil {
		return session.SpawnResult{}, err
	}

	events := make([]domain.RuntimeEvent, 0, 256)
	for _, transcript := range loaded.Transcripts {
		events = append(events, transcript...)
	}
	sort.Slice(events, func(i, j int) bool { return events[i].At < events[j].At })
	context := session.ExtractConversationText(events, 12000)

	var preamble strings.Builder
	preamble.WriteString("Continuing from an imported Claude Code chat in " + cwd + ". ")
	preamble.WriteString("You are starting fresh: this session has no memory of that chat, ")
	preamble.WriteString("so read the transcript below as context and then handle the new request. ")
	preamble.WriteString("Do not assume any tool already ran here.\n\n")
	if context == "" {
		preamble.WriteString("[No prior transcript was available. Treat the next message as a fresh task in the same directory.]\n")
	} else {
		preamble.WriteString("--- Imported transcript ---\n")
		preamble.WriteString(context)
		preamble.WriteString("\n--- End imported transcript ---\n")
	}

	newDriver := domain.DriverKind(strings.TrimSpace(driver))
	if newDriver == "" {
		newDriver = domain.DriverClaude
	}
	result, err := a.spawner.Spawn(a.ctx, []session.SpawnRequest{{
		Title:    importTitle(prompt),
		Prompt:   prompt,
		Preamble: preamble.String(),
		Driver:   newDriver,
		Model:    strings.TrimSpace(model),
		Options:  options,
		Cwd:      cwd,
	}}, session.SpawnOptions{
		Driver:      newDriver,
		Model:       strings.TrimSpace(model),
		Options:     options,
		Cwd:         cwd,
		WorkspaceID: workspaceID,
		Permission:  domain.PermissionBypass,
	})
	if err != nil {
		return result, err
	}
	a.emit(historyChangedChannel)
	return result, nil
}

func isWithinDir(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func compactID(id string) string {
	var builder strings.Builder
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			builder.WriteRune(r)
		}
	}
	compacted := builder.String()
	if len(compacted) > 12 {
		compacted = compacted[:12]
	}
	if compacted == "" {
		compacted = "chat"
	}
	return compacted
}

func importTitle(prompt string) string {
	first := strings.TrimSpace(prompt)
	if idx := strings.IndexAny(first, "\r\n"); idx != -1 {
		first = strings.TrimSpace(first[:idx])
	}
	runes := []rune(first)
	if len(runes) > 40 {
		return string(runes[:40]) + "…"
	}
	if first == "" {
		return "Imported continuation"
	}
	return first
}
