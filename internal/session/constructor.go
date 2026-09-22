package session

import (
	"context"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"composer/internal/domain"
)

// AgentView is what The Orchestrator shows for every worker it owns, mirroring
// how Cursor's coordinator lists the agents running under a Project. Live
// reflects whether the CLI process is still attached; the transcript survives
// in history either way so a dead agent can be resumed or continued elsewhere.
type AgentView struct {
	ThreadID    string            `json:"threadId"`
	Title       string            `json:"title"`
	Driver      domain.DriverKind `json:"driver"`
	Model       string            `json:"model,omitempty"`
	State       domain.TaskState  `json:"state"`
	Cwd         string            `json:"cwd"`
	ProjectCwd  string            `json:"projectCwd,omitempty"`
	WorkspaceID string            `json:"workspaceId"`
	Branch      string            `json:"branch,omitempty"`
	Summary     string            `json:"summary,omitempty"`
	Live        bool              `json:"live"`
}

// LatestPlan is the most recent coordinator plan the constructor executed (or
// skipped). The frontend uses it to reconcile: if the user confirms a plan the
// constructor already launched, it can show the agents instead of spawning
// duplicates.
type LatestPlan struct {
	TurnID      string        `json:"turnId"`
	Tasks       []TaskRequest `json:"tasks"`
	WorkspaceID string        `json:"workspaceId,omitempty"`
	Executed    bool          `json:"executed"`
	At          int64         `json:"at"`
}

var mutatingHint = regexp.MustCompile(`(?i)\b(refactor|implement|fix|bug|migrat|rewrite|rename|delete|remove|add|build|creat|updat|chang|edit|modif|patch|install|upgrade|revert|merge|commit|scaffold|generat|convert|optimi[sz]|clean\s?up|deprecat)\b`)

// Constructor is The Orchestrator backend: a Cursor Projects style coordinator
// engine. The coordinator CLI plans in prose plus a machine-readable task
// block; the constructor — not the frontend — executes that block, tracks
// every worker, and stays continuous per project.
//
// The frontend stays a thin view: it sends messages and renders events. Direct
// agent DM is untouched (deck sends straight to Manager), so unlike Cursor the
// user can still talk to any worker themselves.
type Constructor struct {
	manager     *Manager
	coordinator *Coordinator
	spawner     *Spawner
	workspaces  *Workspaces

	mu       sync.Mutex
	auto     bool
	lastCfg  Config
	replies  map[string]*strings.Builder
	executed map[string]bool
	latest   *LatestPlan
	onSpawn  func(SpawnResult)
}

func NewConstructor(manager *Manager, coordinator *Coordinator, spawner *Spawner, workspaces *Workspaces) *Constructor {
	return &Constructor{
		manager:     manager,
		coordinator: coordinator,
		spawner:     spawner,
		workspaces:  workspaces,
		auto:        true,
		replies:     make(map[string]*strings.Builder),
		executed:    make(map[string]bool),
	}
}

func (c *Constructor) SetAuto(auto bool) {
	c.mu.Lock()
	c.auto = auto
	c.mu.Unlock()
}

func (c *Constructor) Auto() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.auto
}

func (c *Constructor) SetOnSpawn(fn func(SpawnResult)) {
	c.mu.Lock()
	c.onSpawn = fn
	c.mu.Unlock()
}

// Remember stores the coordinator's active driver/model/cwd so a completed
// plan can be executed with the same selection without the frontend resending
// it. Called on every coordinator send.
func (c *Constructor) Remember(cfg Config) {
	c.mu.Lock()
	c.lastCfg = cfg
	c.mu.Unlock()
}

// MarkExecuted records a turn the frontend launched manually (plan-card
// confirm), so the backend does not launch it a second time.
func (c *Constructor) MarkExecuted(turnID string) {
	if turnID == "" {
		return
	}
	c.mu.Lock()
	c.executed[turnID] = true
	c.mu.Unlock()
}

func (c *Constructor) Latest() *LatestPlan {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.latest == nil {
		return nil
	}
	cp := *c.latest
	cp.Tasks = append([]TaskRequest(nil), c.latest.Tasks...)
	return &cp
}

// Observe folds coordinator stream events into per-turn reply text and fires
// the constructor when a turn completes with a plan. Cheap and lock-scoped per
// event; the spawn itself runs detached so the event feed never stalls.
func (c *Constructor) Observe(event domain.RuntimeEvent) {
	if event.ThreadID != CoordinatorThreadID {
		return
	}
	c.mu.Lock()
	switch event.Kind {
	case domain.EventAgentMessage:
		if event.TurnID == "" {
			c.mu.Unlock()
			return
		}
		builder, ok := c.replies[event.TurnID]
		if !ok {
			builder = &strings.Builder{}
			c.replies[event.TurnID] = builder
		}
		if event.Delta {
			builder.WriteString(event.Text)
		} else if builder.Len() == 0 {
			builder.WriteString(event.Text)
		} else {
			builder.WriteString("\n" + event.Text)
		}
		c.mu.Unlock()
	case domain.EventTurnCompleted:
		turnID := event.TurnID
		var text string
		if builder, ok := c.replies[turnID]; ok {
			text = builder.String()
			delete(c.replies, turnID)
		}
		auto := c.auto
		lastCfg := c.lastCfg
		if _, done := c.executed[turnID]; done {
			c.mu.Unlock()
			return
		}
		c.mu.Unlock()
		if turnID == "" || text == "" || !auto {
			return
		}
		tasks := ParseTasks(text)
		if len(tasks) == 0 {
			return
		}
		go c.execute(turnID, tasks, lastCfg)
	case domain.EventTurnFailed:
		if event.TurnID != "" {
			delete(c.replies, event.TurnID)
		}
		c.mu.Unlock()
	default:
		c.mu.Unlock()
	}
}

func (c *Constructor) execute(turnID string, tasks []TaskRequest, cfg Config) {
	c.mu.Lock()
	if c.executed[turnID] {
		c.mu.Unlock()
		return
	}
	c.executed[turnID] = true
	c.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var spawnTasks []TaskRequest
	for _, task := range tasks {
		if task.Action == "message" {
			targetID := task.TargetThreadID
			if targetID == "" {
				// Try to match by title
				for _, a := range c.ListAgents() {
					if strings.EqualFold(a.Title, task.Title) || strings.Contains(strings.ToLower(task.Title), strings.ToLower(a.Title)) {
						targetID = a.ThreadID
						break
					}
				}
			}

			if targetID != "" {
				if err := c.routeMessageToAgent(ctx, targetID, task.Prompt); err == nil {
					continue
				}
			}
			// Fallback to spawning if target agent routing could not complete
		}
		spawnTasks = append(spawnTasks, task)
	}

	var result SpawnResult
	var err error
	if len(spawnTasks) > 0 {
		requests := make([]SpawnRequest, 0, len(spawnTasks))
		useWorktree := false
		for _, task := range spawnTasks {
			cwd := task.Cwd
			if cwd == "" {
				cwd = cfg.Cwd
			}
			requests = append(requests, SpawnRequest{
				Title:  task.Title,
				Prompt: task.Prompt,
				Driver: domain.DriverKind(cfg.Driver),
				Model:  cfg.Model,
				Cwd:    cwd,
			})
			if mutatingHint.MatchString(task.Title + " " + task.Prompt) {
				useWorktree = true
			}
		}

		result, err = c.spawner.Spawn(ctx, requests, SpawnOptions{
			Driver:      domain.DriverKind(cfg.Driver),
			Model:       cfg.Model,
			Options:     cfg.Options,
			Cwd:         cfg.Cwd,
			UseWorktree: useWorktree,
			Title:       spawnTasks[0].Title,
			Prompt:      strings.Join(taskTitles(spawnTasks), ", "),
			Permission:  cfg.Permission,
		})
	}

	c.mu.Lock()
	latest := &LatestPlan{TurnID: turnID, Tasks: tasks, At: time.Now().UnixMilli()}
	if err == nil {
		if len(spawnTasks) > 0 {
			latest.WorkspaceID = result.Workspace.ID
		}
		latest.Executed = true
	}
	c.latest = latest
	onSpawn := c.onSpawn
	c.mu.Unlock()

	if err == nil && onSpawn != nil && len(result.Tasks) > 0 {
		onSpawn(result)
	} else if err != nil && c.manager != nil && c.manager.Bus() != nil {
		c.manager.Bus().Publish(domain.RuntimeEvent{
			Kind:     domain.EventTurnFailed,
			ThreadID: CoordinatorThreadID,
			TurnID:   turnID,
			Error:    "Failed to execute plan: " + err.Error(),
			At:       time.Now().UnixMilli(),
		})
	}
}

func (c *Constructor) routeMessageToAgent(ctx context.Context, targetThreadID, text string) error {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return fmt.Errorf("empty prompt")
	}

	// Check if session is live in manager
	live := false
	for _, sess := range c.manager.Sessions() {
		if sess.ThreadID == targetThreadID {
			live = true
			break
		}
	}

	// If not live, revive / resume the session using task metadata
	if !live {
		if task, ok := c.workspaces.TaskByThread(targetThreadID); ok {
			cwd := ""
			if task.Worktree != nil && task.Worktree.Path != "" {
				cwd = task.Worktree.Path
			}
			if cwd == "" {
				if ws := c.workspaces.Get(task.WorkspaceID); ws != nil {
					cwd = ws.Cwd
				}
			}
			_, _ = c.manager.Start(ctx, task.Driver, domain.SessionStartInput{
				ThreadID: targetThreadID,
				Cwd:      cwd,
				Model:    task.Model,
				Resume:   targetThreadID,
			})
		}
	}

	turnID := fmt.Sprintf("%s-turn-%d", targetThreadID, time.Now().UnixMilli())
	c.manager.RecordUserMessage(targetThreadID, turnID, trimmed)
	c.workspaces.SetState(targetThreadID, domain.TaskRunning)
	return c.manager.Send(ctx, domain.SendTurnInput{
		ThreadID: targetThreadID,
		TurnID:   turnID,
		Text:     trimmed,
	})
}

func taskTitles(tasks []TaskRequest) []string {
	out := make([]string, 0, len(tasks))
	for _, task := range tasks {
		out = append(out, task.Title)
	}
	return out
}

// ListAgents returns every worker The Orchestrator owns across all workspaces,
// newest workspace first, with live attachment state. This is the coordinator's
// view Cursor shows per Project; here it spans projects and can be filtered by
// cwd on the caller side.
func (c *Constructor) ListAgents() []AgentView {
	live := make(map[string]domain.Session)
	for _, sess := range c.manager.Sessions() {
		if sess.ThreadID == CoordinatorThreadID {
			continue
		}
		live[sess.ThreadID] = sess
	}
	out := make([]AgentView, 0)
	for _, workspace := range c.workspaces.List() {
		for _, task := range c.workspaces.Tasks(workspace.ID) {
			view := AgentView{
				ThreadID:    task.ThreadID,
				Title:       task.Title,
				Driver:      task.Driver,
				Model:       task.Model,
				State:       task.State,
				WorkspaceID: task.WorkspaceID,
				Cwd:         workspace.Cwd,
				ProjectCwd:  workspace.Cwd,
				Summary:     task.Summary,
			}
			if task.Worktree != nil {
				view.Branch = task.Worktree.Branch
				if task.Worktree.Path != "" {
					view.Cwd = task.Worktree.Path
				}
			}
			if sess, ok := live[task.ThreadID]; ok {
				view.Live = true
				if view.Model == "" {
					view.Model = sess.Model
				}
				if sess.Cwd != "" && task.Worktree == nil {
					view.Cwd = sess.Cwd
				}
			}
			out = append(out, view)
		}
	}
	return out
}

// FormatAgentManifest produces a compact, token-efficient summary of active agents
// in the project (mirroring Cursor's agent roster and Claude Projects context)
// to inject into the coordinator's prompt without blowing up token usage.
func (c *Constructor) FormatAgentManifest(cwd string) string {
	agents := c.ListAgents()
	if len(agents) == 0 {
		return ""
	}

	cleanCwd := filepath.Clean(strings.TrimSpace(cwd))
	var active []AgentView
	for _, a := range agents {
		// Only include live or recently active agents (not closed unless live)
		if a.State == domain.TaskClosed && !a.Live {
			continue
		}
		// Filter by cwd if specified (match against ProjectCwd or Cwd)
		if cleanCwd != "" {
			match := false
			for _, checkDir := range []string{a.ProjectCwd, a.Cwd} {
				if checkDir == "" {
					continue
				}
				agentClean := filepath.Clean(checkDir)
				if strings.EqualFold(agentClean, cleanCwd) ||
					strings.HasPrefix(strings.ToLower(agentClean), strings.ToLower(cleanCwd)) ||
					strings.HasPrefix(strings.ToLower(cleanCwd), strings.ToLower(agentClean)) {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		}
		active = append(active, a)
	}

	if len(active) == 0 {
		return ""
	}

	var b strings.Builder
	b.WriteString("Active Agents in this Project:\n")
	for _, a := range active {
		status := "IDLE"
		if a.State == domain.TaskRunning {
			status = "RUNNING"
		} else if a.State == domain.TaskFailed {
			status = "FAILED"
		} else if a.State == domain.TaskComplete {
			status = "COMPLETED"
		}

		branchInfo := ""
		if a.Branch != "" {
			branchInfo = fmt.Sprintf(" | Branch: %s", a.Branch)
		}
		summaryInfo := ""
		if a.Summary != "" {
			s := a.Summary
			if len(s) > 60 {
				s = s[:60] + "..."
			}
			summaryInfo = fmt.Sprintf(" | Last note: %s", s)
		}

		b.WriteString(fmt.Sprintf("- [ID: %s] Title: %q | Status: %s%s%s\n", a.ThreadID, a.Title, status, branchInfo, summaryInfo))
	}
	b.WriteString("(You can route follow-ups to an existing agent by setting \"action\":\"message\" and \"targetThreadId\":\"<ID>\" in composer:tasks, or spawn a new agent with \"action\":\"spawn\".)")
	return b.String()
}
