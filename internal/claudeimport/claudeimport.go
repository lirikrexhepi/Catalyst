// Package claudeimport reads Claude Code session transcripts from disk so the
// user can bring outside chat history into Composer.
//
// Claude Code stores one JSONL file per conversation under
// ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl (CLAUDE_CONFIG_DIR
// overrides the base). Each line carries a top-level type: user and assistant
// hold the conversation, everything else is queue bookkeeping, file snapshots
// or UI hints. Records with isSidechain set belong to a subagent whose work
// the parent already summarises, so they are skipped.
//
// Conversion targets domain.RuntimeEvent, the same shape live adapters emit,
// which means an imported transcript replays through the existing frontend
// reducer with no special casing. Imports are deliberately fresh-start only:
// no provider session id is stored, so resuming an imported task begins a new
// CLI session in the same directory and the old transcript rides along as
// prompt context instead of a --resume.
package claudeimport

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"composer/internal/domain"
)

const (
	maxTextChars       = 30000
	maxToolOutputChars = 8000
	maxListFiles       = 2000
	maxParseBytes      = 10 * 1024 * 1024
)

// ExternalSession is one Claude Code conversation found on disk, described
// with only what the import picker needs to show.
type ExternalSession struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Cwd          string `json:"cwd"`
	Model        string `json:"model,omitempty"`
	Preview      string `json:"preview,omitempty"`
	FilePath     string `json:"filePath"`
	MessageCount int    `json:"messageCount"`
	StartedAt    int64  `json:"startedAt"`
	UpdatedAt    int64  `json:"updatedAt"`
}

// ParsedSession is a fully converted transcript, ready to be stored. Events
// carry no thread id yet; the importer assigns that when it creates the task.
type ParsedSession struct {
	SessionID string                `json:"sessionId"`
	Title     string                `json:"title"`
	Prompt    string                `json:"prompt"`
	Cwd       string                `json:"cwd"`
	Model     string                `json:"model,omitempty"`
	StartedAt int64                 `json:"startedAt"`
	UpdatedAt int64                 `json:"updatedAt"`
	Events    []domain.RuntimeEvent `json:"events"`
}

// ProjectsDir reports where Claude Code keeps its transcripts, honouring the
// documented CLAUDE_CONFIG_DIR override.
func ProjectsDir() string {
	if dir := strings.TrimSpace(os.Getenv("CLAUDE_CONFIG_DIR")); dir != "" {
		return filepath.Join(dir, "projects")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude", "projects")
}

// List scans the projects tree and describes every importable conversation,
// newest first. Files that cannot be parsed are skipped rather than failing
// the whole listing.
func List() ([]ExternalSession, error) {
	root := ProjectsDir()
	if root == "" {
		return nil, nil
	}
	var paths []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(entry.Name()), ".jsonl") {
			return nil
		}
		paths = append(paths, path)
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	out := make([]ExternalSession, 0, len(paths))
	for _, path := range paths {
		if len(out) >= maxListFiles {
			break
		}
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if info.Size() > maxParseBytes {
			continue
		}
		parsed, err := ParseFile(path)
		if err != nil || parsed == nil || len(parsed.Events) == 0 {
			continue
		}
		out = append(out, ExternalSession{
			ID:           parsed.SessionID,
			Title:        parsed.Title,
			Cwd:          parsed.Cwd,
			Model:        parsed.Model,
			Preview:      previewText(parsed.Prompt, 140),
			FilePath:     path,
			MessageCount: countMessages(parsed.Events),
			StartedAt:    parsed.StartedAt,
			UpdatedAt:    parsed.UpdatedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

// ParseFile converts one Claude Code JSONL transcript into runtime events.
func ParseFile(path string) (*ParsedSession, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	info, _ := file.Stat()
	fallbackAt := time.Now().UnixMilli()
	if info != nil {
		fallbackAt = info.ModTime().UnixMilli()
	}

	parsed := &ParsedSession{}
	converter := &converter{fallbackAt: fallbackAt}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var record fileRecord
		if err := json.Unmarshal(line, &record); err != nil {
			continue
		}
		converter.visit(record, parsed)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	if parsed.SessionID == "" {
		parsed.SessionID = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	if parsed.Title == "" {
		parsed.Title = previewText(parsed.Prompt, 40)
	}
	if parsed.Title == "" {
		parsed.Title = "Imported Claude Code chat"
	}
	if parsed.StartedAt == 0 {
		parsed.StartedAt = fallbackAt
	}
	if parsed.UpdatedAt == 0 || parsed.UpdatedAt < parsed.StartedAt {
		parsed.UpdatedAt = firstNonZero(firstEventAt(parsed.Events), fallbackAt)
	}
	for i := range parsed.Events {
		parsed.Events[i].Seq = uint64(i + 1)
	}
	return parsed, nil
}

type fileRecord struct {
	Type        string          `json:"type"`
	SessionID   string          `json:"sessionId"`
	Timestamp   string          `json:"timestamp"`
	UUID        string          `json:"uuid"`
	Cwd         string          `json:"cwd"`
	IsSidechain bool            `json:"isSidechain"`
	AITitle     string          `json:"aiTitle"`
	Message     json.RawMessage `json:"message"`
}

type fileMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
	Model   string          `json:"model,omitempty"`
	Usage   *fileUsage      `json:"usage,omitempty"`
}

type fileUsage struct {
	InputTokens              int64 `json:"input_tokens"`
	OutputTokens             int64 `json:"output_tokens"`
	CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
	CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
}

type contentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	Thinking  string          `json:"thinking,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
	Content   json.RawMessage `json:"content,omitempty"`
	IsError   bool            `json:"is_error,omitempty"`
}

type converter struct {
	fallbackAt int64
	lastAt     int64
	seq        int
	turn       int
	turnID     string
}

func (c *converter) visit(record fileRecord, parsed *ParsedSession) {
	if record.IsSidechain {
		return
	}
	if record.SessionID != "" && parsed.SessionID == "" {
		parsed.SessionID = record.SessionID
	}
	if record.Cwd != "" && parsed.Cwd == "" {
		parsed.Cwd = record.Cwd
	}
	if record.AITitle != "" && parsed.Title == "" {
		parsed.Title = record.AITitle
	}
	at := parseAt(record.Timestamp, c.fallbackAt)
	if at < c.lastAt {
		at = c.lastAt
	}
	c.lastAt = at

	switch record.Type {
	case "user":
		c.visitUser(record, at, parsed)
	case "assistant":
		c.visitAssistant(record, at, parsed)
	}
}

func (c *converter) visitUser(record fileRecord, at int64, parsed *ParsedSession) {
	if len(record.Message) == 0 {
		return
	}
	var msg fileMessage
	if err := json.Unmarshal(record.Message, &msg); err != nil {
		return
	}
	if msg.Role != "" && msg.Role != "user" {
		return
	}
	text, results := splitUserContent(msg.Content)
	text = strings.TrimSpace(text)
	if text != "" {
		c.turn++
		c.turnID = "import-turn-" + itoa(c.turn)
		if parsed.Prompt == "" {
			parsed.Prompt = truncate(text, 2000)
		}
		if parsed.StartedAt == 0 {
			parsed.StartedAt = at
		}
		parsed.UpdatedAt = at
		c.emit(parsed, domain.RuntimeEvent{
			Kind:   domain.EventUserMessage,
			TurnID: c.turnID,
			ItemID: firstNonEmpty(record.UUID, "import-user-"+itoa(c.turn)),
			At:     at,
			Text:   truncate(text, maxTextChars),
		})
	}
	for _, result := range results {
		parsed.UpdatedAt = at
		c.emit(parsed, domain.RuntimeEvent{
			Kind:   domain.EventToolResult,
			TurnID: c.turnID,
			ItemID: result.id,
			At:     at,
			Tool: &domain.ToolCall{
				ID:     result.id,
				Name:   result.name,
				Status: result.status,
				Output: truncate(result.output, maxToolOutputChars),
			},
		})
	}
}

func (c *converter) visitAssistant(record fileRecord, at int64, parsed *ParsedSession) {
	if len(record.Message) == 0 {
		return
	}
	var msg fileMessage
	if err := json.Unmarshal(record.Message, &msg); err != nil {
		return
	}
	if msg.Model != "" {
		parsed.Model = msg.Model
	}
	var blocks []contentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		var text string
		if json.Unmarshal(msg.Content, &text) == nil && strings.TrimSpace(text) != "" {
			blocks = []contentBlock{{Type: "text", Text: text}}
		} else {
			return
		}
	}
	turnID := c.turnID
	if turnID == "" {
		c.turn++
		turnID = "import-turn-" + itoa(c.turn)
		c.turnID = turnID
	}
	if parsed.StartedAt == 0 {
		parsed.StartedAt = at
	}
	parsed.UpdatedAt = at
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if strings.TrimSpace(block.Text) == "" {
				continue
			}
			c.emit(parsed, domain.RuntimeEvent{
				Kind:   domain.EventAgentMessage,
				TurnID: turnID,
				ItemID: firstNonEmpty(record.UUID+"-"+block.Type, "import-text-"+itoa(c.seq+1)),
				At:     at,
				Text:   truncate(block.Text, maxTextChars),
			})
		case "thinking":
			if strings.TrimSpace(block.Thinking) == "" {
				continue
			}
			c.emit(parsed, domain.RuntimeEvent{
				Kind:   domain.EventAgentThought,
				TurnID: turnID,
				ItemID: firstNonEmpty(record.UUID+"-thinking", "import-thinking-"+itoa(c.seq+1)),
				At:     at,
				Text:   truncate(block.Thinking, maxTextChars),
			})
		case "tool_use":
			if block.ID == "" && block.Name == "" {
				continue
			}
			tool := &domain.ToolCall{ID: block.ID, Name: block.Name, Status: domain.ToolInProgress}
			if len(block.Input) > 0 {
				var input map[string]any
				if json.Unmarshal(block.Input, &input) == nil {
					tool.Input = input
				}
			}
			c.emit(parsed, domain.RuntimeEvent{
				Kind:   domain.EventToolCall,
				TurnID: turnID,
				ItemID: firstNonEmpty(block.ID, "import-tool-"+itoa(c.seq+1)),
				At:     at,
				Tool:   tool,
			})
		}
	}
	if msg.Usage != nil && (msg.Usage.InputTokens > 0 || msg.Usage.OutputTokens > 0) {
		c.emit(parsed, domain.RuntimeEvent{
			Kind:   domain.EventUsage,
			TurnID: turnID,
			At:     at,
			Usage: &domain.Usage{
				InputTokens:      msg.Usage.InputTokens,
				OutputTokens:     msg.Usage.OutputTokens,
				CacheReadTokens:  msg.Usage.CacheReadInputTokens,
				CacheWriteTokens: msg.Usage.CacheCreationInputTokens,
			},
		})
	}
}

func (c *converter) emit(parsed *ParsedSession, event domain.RuntimeEvent) {
	event.Driver = domain.DriverClaude
	c.seq++
	parsed.Events = append(parsed.Events, event)
}

type toolResult struct {
	id     string
	name   string
	status domain.ToolStatus
	output string
}

func splitUserContent(raw json.RawMessage) (string, []toolResult) {
	if len(raw) == 0 {
		return "", nil
	}
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return text, nil
	}
	var blocks []contentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return "", nil
	}
	var builder strings.Builder
	var results []toolResult
	for _, block := range blocks {
		switch block.Type {
		case "text":
			if block.Text != "" {
				if builder.Len() > 0 {
					builder.WriteString("\n")
				}
				builder.WriteString(block.Text)
			}
		case "tool_result":
			status := domain.ToolCompleted
			if block.IsError {
				status = domain.ToolFailed
			}
			results = append(results, toolResult{
				id:     block.ToolUseID,
				status: status,
				output: flattenToolContent(block.Content),
			})
		}
	}
	return builder.String(), results
}

func flattenToolContent(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}
	var blocks []contentBlock
	if json.Unmarshal(raw, &blocks) == nil {
		var builder strings.Builder
		for _, block := range blocks {
			if block.Text != "" {
				if builder.Len() > 0 {
					builder.WriteString("\n")
				}
				builder.WriteString(block.Text)
			}
		}
		if builder.Len() > 0 {
			return builder.String()
		}
	}
	return string(raw)
}

func parseAt(raw string, fallback int64) int64 {
	if raw == "" {
		return fallback
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed.UnixMilli()
	}
	var millis int64
	if err := json.Unmarshal([]byte(raw), &millis); err == nil && millis > 0 {
		if millis < 1e12 {
			millis *= 1000
		}
		return millis
	}
	return fallback
}

func countMessages(events []domain.RuntimeEvent) int {
	count := 0
	for _, event := range events {
		if event.Kind == domain.EventUserMessage || event.Kind == domain.EventAgentMessage {
			count++
		}
	}
	return count
}

func previewText(text string, limit int) string {
	text = strings.TrimSpace(text)
	if idx := strings.IndexAny(text, "\r\n"); idx != -1 {
		text = strings.TrimSpace(text[:idx])
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "…"
}

func truncate(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	return text[:limit] + "\n[truncated]"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func firstNonZero(values ...int64) int64 {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func firstEventAt(events []domain.RuntimeEvent) int64 {
	for _, event := range events {
		if event.At > 0 {
			return event.At
		}
	}
	return 0
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	negative := n < 0
	if negative {
		n = -n
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if negative {
		digits = append([]byte{'-'}, digits...)
	}
	return string(digits)
}
