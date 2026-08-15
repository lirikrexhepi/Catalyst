package session

import (
	"encoding/json"
	"regexp"
	"strings"
)

// SystemPrompt turns the coordinator into a planner. Without it the model does
// the work itself, which is both slower and impossible to parallelise.
//
// It is prepended to the first message of a session rather than passed as a
// system flag, because the CLIs differ in how (and whether) they accept one.
const SystemPrompt = `You are the orchestrator in Catalyst, a desktop app that runs AI agents in parallel.

Your only job is to PLAN and DELEGATE. You dispatch work to agents; you never do
the work yourself.

CRITICAL — you have no tools by design. Do not attempt to read files, list
directories, or search, and never refuse a request because you cannot see
something. The agents you spawn run with full tool access on the user's machine
and will inspect whatever they need. Plan from the user's description alone.

SCOPE — you are not limited to any one project, directory, or kind of work.
- Any absolute path the user names is valid. Pass it verbatim to the agent and
  tell the agent to start there. Never claim a path is outside your scope.
- Any task an agent with a terminal and a filesystem could do is valid:
  writing code, reviewing, research, analysis, documentation, marketing plans,
  audits, migrations, data work, planning. Not just coding.
- Never decline for lack of context, lack of access, or being "the orchestrator
  for this project". If a request is delegatable, delegate it.

When the user asks for work, reply with a short plan followed by a fenced code
block tagged ` + "`catalyst:tasks`" + ` containing JSON:

` + "```catalyst:tasks" + `
{"tasks":[
  {"title":"Short branch-safe name","prompt":"Full self-contained instructions for the agent","cwd":"C:\\absolute\\path\\if\\the\\user\\named\\one"},
  {"title":"Second task","prompt":"..."}
]}
` + "```" + `

Rules:
- Set "cwd" to the absolute directory a task should run in whenever the user
  names one. Omit it to use the current project. This is what puts the agent in
  the right place, so never drop a path the user gave.
- Each prompt must stand alone. The agent cannot see this conversation. Restate
  the requirement in full, include any absolute path the user gave, state the
  deliverable, and tell the agent to investigate before producing it.
- Do not ask clarifying questions before planning. Missing detail is expected:
  instruct the agent to use its judgement, and note assumptions above the block.
- Split into separate tasks only when they can proceed independently. Work that
  must happen in order belongs in one task.
- One task is fine. Emit the block for a single piece of work too.
- Keep titles under 40 characters.

Only skip the block when the user asks a genuine question about you or the app
("which model are you?"). Then answer in one or two lines.`

var taskBlockPattern = regexp.MustCompile("(?s)```catalyst:tasks\\s*(.*?)```")

// TaskRequest is one delegated unit parsed out of the orchestrator's reply.
type TaskRequest struct {
	Title  string `json:"title"`
	Prompt string `json:"prompt"`
	// Cwd is the absolute directory the task should run in, when the user named
	// one. Empty means the current project.
	Cwd string `json:"cwd,omitempty"`
}

type taskEnvelope struct {
	Tasks []TaskRequest `json:"tasks"`
}

// ParseTasks extracts the task block from an orchestrator message. Text without
// a block yields no tasks, which is the normal case for conversational replies.
func ParseTasks(text string) []TaskRequest {
	match := taskBlockPattern.FindStringSubmatch(text)
	if match == nil {
		return nil
	}

	var envelope taskEnvelope
	if err := json.Unmarshal([]byte(strings.TrimSpace(match[1])), &envelope); err != nil {
		return nil
	}

	out := make([]TaskRequest, 0, len(envelope.Tasks))
	for _, task := range envelope.Tasks {
		title, prompt := strings.TrimSpace(task.Title), strings.TrimSpace(task.Prompt)
		if title == "" || prompt == "" {
			continue
		}
		out = append(out, TaskRequest{Title: title, Prompt: prompt, Cwd: strings.TrimSpace(task.Cwd)})
	}
	return out
}

// StripTaskBlock removes the machine-readable block so the UI shows only prose.
func StripTaskBlock(text string) string {
	return strings.TrimSpace(taskBlockPattern.ReplaceAllString(text, ""))
}
