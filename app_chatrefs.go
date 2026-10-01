package main

import (
	"fmt"
	"sort"
	"strings"

	"composer/internal/domain"
	"composer/internal/session"
)

const (
	chatRefPrefix   = "chat://"
	chatRefMaxChars = 8000
)

func (a *App) expandChatRefs(files []domain.FileRef) (string, []domain.FileRef) {
	var blocks []string
	rest := make([]domain.FileRef, 0, len(files))
	for _, file := range files {
		if !strings.HasPrefix(file.Path, chatRefPrefix) {
			rest = append(rest, file)
			continue
		}
		if block := a.chatRefContext(strings.TrimPrefix(file.Path, chatRefPrefix)); block != "" {
			blocks = append(blocks, block)
		}
	}
	return strings.Join(blocks, "\n\n"), rest
}

func (a *App) chatRefContext(ref string) string {
	ref, _, _ = strings.Cut(ref, "?")
	workspaceID, threadID, _ := strings.Cut(ref, "/")
	if workspaceID == "" {
		return ""
	}
	loaded, err := a.historyStore.Load(workspaceID)
	if err != nil {
		return fmt.Sprintf("<referenced_chat id=%q>\nThis chat could not be found.\n</referenced_chat>", ref)
	}
	var events []domain.RuntimeEvent
	for id, transcript := range loaded.Transcripts {
		if threadID == "" || id == threadID || strings.HasPrefix(id, threadID+"-cont-") {
			events = append(events, transcript...)
		}
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].At < events[j].At })
	title := loaded.Meta.Workspace.Title
	for _, task := range loaded.Meta.Tasks {
		if task.ThreadID == threadID && task.Title != "" {
			title = task.Title
		}
	}
	text := session.ExtractConversationText(events, chatRefMaxChars)
	if text == "" {
		text = "(no messages)"
	}
	return fmt.Sprintf("<referenced_chat title=%q cwd=%q>\nThe user attached this earlier chat for context. Recent transcript, newest last:\n%s\n</referenced_chat>", title, loaded.Meta.Workspace.Cwd, text)
}
