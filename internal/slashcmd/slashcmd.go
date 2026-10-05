package slashcmd

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"composer/internal/skills"
)

type Command struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"`
	Kind        string `json:"kind"`
	Prompt      string `json:"prompt,omitempty"`
}

var claudeBuiltins = []Command{
	{Name: "compact", Description: "Summarize the conversation to free up context"},
	{Name: "clear", Description: "Start over with an empty context"},
	{Name: "context", Description: "Show what is using the context window"},
	{Name: "cost", Description: "Show token usage and cost for this session"},
	{Name: "init", Description: "Create a CLAUDE.md for this project"},
	{Name: "review", Description: "Review the current changes or a pull request"},
	{Name: "security-review", Description: "Security review of the pending changes"},
	{Name: "loop", Description: "Run a prompt or command on a recurring interval"},
	{Name: "add-dir", Description: "Add another working directory to the session"},
	{Name: "pr-comments", Description: "Fetch comments from a pull request"},
}

func List(driver, cwd string) []Command {
	var out []Command
	if driver == "claude" {
		for _, command := range claudeBuiltins {
			command.Source = "claude"
			command.Kind = "builtin"
			out = append(out, command)
		}
	}
	out = append(out, custom(driver, cwd)...)
	if driver == "claude" {
		out = append(out, skillCommands(cwd, out)...)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return kindRank(out[i].Kind) < kindRank(out[j].Kind)
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func kindRank(kind string) int {
	switch kind {
	case "builtin":
		return 0
	case "custom":
		return 1
	default:
		return 2
	}
}

func skillCommands(cwd string, existing []Command) []Command {
	taken := map[string]bool{}
	for _, command := range existing {
		taken[command.Name] = true
	}
	var out []Command
	for _, info := range skills.List(cwd) {
		if taken[info.Name] {
			continue
		}
		out = append(out, Command{Name: info.Name, Description: info.Description, Source: info.Source, Kind: "skill"})
	}
	return out
}

type root struct {
	dir    string
	source string
	ext    string
}

func roots(driver, cwd string) []root {
	home, _ := os.UserHomeDir()
	var list []root
	switch driver {
	case "claude":
		base := filepath.Join(home, ".claude")
		if dir := os.Getenv("CLAUDE_CONFIG_DIR"); dir != "" {
			base = dir
		}
		list = append(list, root{filepath.Join(base, "commands"), "user", ".md"})
		if cwd != "" {
			list = append(list, root{filepath.Join(cwd, ".claude", "commands"), "project", ".md"})
		}
	case "opencode":
		list = append(list,
			root{filepath.Join(home, ".config", "opencode", "command"), "user", ".md"},
			root{filepath.Join(home, ".config", "opencode", "commands"), "user", ".md"},
		)
		if cwd != "" {
			list = append(list,
				root{filepath.Join(cwd, ".opencode", "command"), "project", ".md"},
				root{filepath.Join(cwd, ".opencode", "commands"), "project", ".md"},
			)
		}
	case "codex":
		list = append(list, root{filepath.Join(home, ".codex", "prompts"), "user", ".md"})
	case "antigravity":
		list = append(list, root{filepath.Join(home, ".gemini", "commands"), "user", ".toml"})
		if cwd != "" {
			list = append(list, root{filepath.Join(cwd, ".gemini", "commands"), "project", ".toml"})
		}
	}
	if home == "" {
		return nil
	}
	return list
}

func custom(driver, cwd string) []Command {
	found := map[string]Command{}
	for _, r := range roots(driver, cwd) {
		_ = filepath.WalkDir(r.dir, func(path string, entry fs.DirEntry, err error) error {
			if err != nil || entry.IsDir() || !strings.EqualFold(filepath.Ext(path), r.ext) {
				return nil
			}
			rel, relErr := filepath.Rel(r.dir, path)
			if relErr != nil {
				return nil
			}
			name := strings.TrimSuffix(filepath.ToSlash(rel), filepath.Ext(rel))
			name = strings.ReplaceAll(name, "/", ":")
			data, readErr := os.ReadFile(path)
			if readErr != nil {
				return nil
			}
			var description, prompt string
			if r.ext == ".toml" {
				description, prompt = parseTOML(string(data))
			} else {
				description, prompt = parseMarkdown(string(data))
			}
			found[name] = Command{Name: name, Description: description, Source: r.source, Kind: "custom", Prompt: prompt}
			return nil
		})
	}
	out := make([]Command, 0, len(found))
	for _, command := range found {
		out = append(out, command)
	}
	return out
}

func parseMarkdown(text string) (description, body string) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if !strings.HasPrefix(text, "---\n") {
		return firstLine(text), strings.TrimSpace(text)
	}
	end := strings.Index(text[4:], "\n---")
	if end < 0 {
		return firstLine(text), strings.TrimSpace(text)
	}
	front := text[4 : 4+end]
	body = strings.TrimSpace(text[4+end+4:])
	for _, line := range strings.Split(front, "\n") {
		key, value, ok := strings.Cut(line, ":")
		if ok && strings.TrimSpace(key) == "description" {
			description = strings.Trim(strings.TrimSpace(value), "\"'")
		}
	}
	if description == "" {
		description = firstLine(body)
	}
	return description, body
}

func parseTOML(text string) (description, prompt string) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if index := strings.Index(text, "description"); index >= 0 {
		line := text[index:]
		if end := strings.Index(line, "\n"); end >= 0 {
			line = line[:end]
		}
		if _, value, ok := strings.Cut(line, "="); ok {
			description = strings.Trim(strings.TrimSpace(value), "\"'")
		}
	}
	if index := strings.Index(text, "prompt"); index >= 0 {
		rest := text[index:]
		if _, value, ok := strings.Cut(rest, "="); ok {
			value = strings.TrimSpace(value)
			switch {
			case strings.HasPrefix(value, `"""`):
				value = value[3:]
				if end := strings.Index(value, `"""`); end >= 0 {
					prompt = strings.TrimSpace(value[:end])
				}
			case strings.HasPrefix(value, `"`):
				value = value[1:]
				if end := strings.Index(value, `"`); end >= 0 {
					prompt = value[:end]
				}
			}
		}
	}
	return description, prompt
}

func firstLine(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#"))
		if line != "" {
			if len(line) > 90 {
				return line[:90]
			}
			return line
		}
	}
	return ""
}
