package session

import (
	"strings"

	"composer/internal/domain"
)

const recapPromptHeader = `Summarize this conversation into a structured recap for future continuation. Be factual and concise. Sections:`

func BuildRecapPrompt(events []domain.RuntimeEvent, cwd string) string {
	conversation := ExtractConversationText(events, maxHandoffChars)
	var b strings.Builder
	b.WriteString("You are compacting context for a long-running project coordinator that never dies. ")
	b.WriteString("The recap must let a fresh session continue exactly where this one left off.\n\n")
	if cwd != "" {
		b.WriteString("Working directory: " + cwd + "\n\n")
	}
	b.WriteString(recapPromptHeader + "\n")
	b.WriteString("- Goals: what the user is trying to achieve\n")
	b.WriteString("- Decisions: key choices made and why\n")
	b.WriteString("- Work done: what agents already did, files/branches touched\n")
	b.WriteString("- Open tasks: what remains, blockers, next step\n")
	b.WriteString("- Learnings: how this codebase works, how to test, user preferences\n\n")
	b.WriteString("--- Conversation ---\n")
	if conversation == "" {
		b.WriteString("[no transcript available]\n")
	} else {
		b.WriteString(conversation + "\n")
	}
	b.WriteString("--- End ---\n\nReply with the recap only, no preamble.")
	return b.String()
}

func RuleFallbackRecap(events []domain.RuntimeEvent, cwd string) string {
	conversation := ExtractConversationText(events, maxHandoffChars)
	if conversation == "" {
		return ""
	}
	var b strings.Builder
	if cwd != "" {
		b.WriteString("Working directory: " + cwd + "\n\n")
	}
	b.WriteString(conversation)
	return b.String()
}
