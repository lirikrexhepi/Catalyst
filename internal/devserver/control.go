package devserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"composer/internal/domain"
)

const (
	EnvURL   = "COMPOSER_SERVE_URL"
	EnvToken = "COMPOSER_SERVE_TOKEN"
	EnvOwner = "COMPOSER_SERVE_THREAD"
)

type TaskPersister interface {
	SetTasks(ctx context.Context, sessionID string, items []string) error
	AddTask(ctx context.Context, sessionID string, item string) error
	StartTask(ctx context.Context, sessionID string, target string) error
	DoneTask(ctx context.Context, sessionID string, target string) error
	RemoveTask(ctx context.Context, sessionID string, target string) error
	ListPlanEntries(ctx context.Context, sessionID string) ([]domain.PlanEntry, error)
}

type Control struct {
	manager *Manager
	token   string
	owner   func(callerPID int) string

	taskMu      sync.Mutex
	tasks       map[string][]domain.PlanEntry
	taskUpdater func(threadID string, plan []domain.PlanEntry)
	taskService TaskPersister

	listener net.Listener
	server   *http.Server
}

type startRequest struct {
	Label     string   `json:"label,omitempty"`
	Command   string   `json:"command,omitempty"`
	Args      []string `json:"args,omitempty"`
	Cwd       string   `json:"cwd"`
	Thread    string   `json:"ownerThreadId,omitempty"`
	CallerPID int      `json:"callerPid,omitempty"`
}

type taskRequest struct {
	Action    string   `json:"action"` // "set", "add", "start", "done", "remove", "list"
	Tasks     []string `json:"tasks,omitempty"`
	Item      string   `json:"item,omitempty"`
	Target    string   `json:"target,omitempty"`
	Thread    string   `json:"ownerThreadId,omitempty"`
	CallerPID int      `json:"callerPid,omitempty"`
}

type taskResponse struct {
	Status string             `json:"status"`
	Tasks  []domain.PlanEntry `json:"tasks"`
	Error  string             `json:"error,omitempty"`
}

type startResponse struct {
	ID      string `json:"id"`
	PID     int    `json:"pid"`
	Command string `json:"command"`
	Cwd     string `json:"cwd"`
}

func NewControl(manager *Manager) *Control {
	return &Control{
		manager: manager,
		token:   randomToken(),
		tasks:   make(map[string][]domain.PlanEntry),
	}
}

func randomToken() string {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("composer-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func (c *Control) Listen() error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	c.listener = listener

	mux := http.NewServeMux()
	mux.HandleFunc("/start", c.handleStart)
	mux.HandleFunc("/tasks", c.handleTasks)
	c.server = &http.Server{Handler: c.authenticated(mux), ReadHeaderTimeout: 5 * time.Second}

	go func() { _ = c.server.Serve(listener) }()
	return nil
}

func (c *Control) Close() {
	if c.server == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = c.server.Shutdown(ctx)
}

func (c *Control) URL() string {
	if c.listener == nil {
		return ""
	}
	return "http://" + c.listener.Addr().String()
}

func (c *Control) Token() string { return c.token }

func (c *Control) SetOwnerResolver(resolve func(callerPID int) string) {
	c.owner = resolve
}

func (c *Control) SetTaskUpdater(updater func(threadID string, plan []domain.PlanEntry)) {
	c.taskMu.Lock()
	defer c.taskMu.Unlock()
	c.taskUpdater = updater
}

func (c *Control) SetTaskService(ts TaskPersister) {
	c.taskMu.Lock()
	defer c.taskMu.Unlock()
	c.taskService = ts
}

func (c *Control) Env() map[string]string {
	if c.listener == nil {
		return nil
	}
	return map[string]string{EnvURL: c.URL(), EnvToken: c.token}
}

func (c *Control) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+c.token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (c *Control) handleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request startRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "malformed request: "+err.Error(), http.StatusBadRequest)
		return
	}

	spec, err := request.spec()
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if spec.OwnerThreadID == "" && c.owner != nil {
		spec.OwnerThreadID = c.owner(request.CallerPID)
	}

	snapshot, err := c.manager.Start(spec)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, exec.ErrNotFound) {
			status = http.StatusBadRequest
		}
		http.Error(w, err.Error(), status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(startResponse{
		ID:      snapshot.ID,
		PID:     snapshot.PID,
		Command: snapshot.Command,
		Cwd:     snapshot.Cwd,
	})
}

func (r startRequest) spec() (Spec, error) {
	command, args := r.Command, r.Args
	if command == "" {
		return Spec{}, fmt.Errorf("command is required")
	}
	if strings.TrimSpace(r.Cwd) == "" {
		return Spec{}, fmt.Errorf("cwd is required")
	}

	return Spec{
		Label:         r.Label,
		Command:       command,
		Args:          args,
		Cwd:           r.Cwd,
		OwnerThreadID: r.Thread,
	}, nil
}

func Ambient(control *Control, binDir string) map[string]string {
	env := control.Env()
	if env == nil {
		env = map[string]string{}
	}
	if binDir != "" {
		env["PATH"] = binDir
	}
	return env
}

func (c *Control) handleTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req taskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "malformed request: "+err.Error(), http.StatusBadRequest)
		return
	}

	threadID := req.Thread
	if threadID == "" && c.owner != nil && req.CallerPID > 0 {
		threadID = c.owner(req.CallerPID)
	}

	if c.taskService != nil && threadID != "" {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var err error
		switch req.Action {
		case "set":
			err = c.taskService.SetTasks(ctx, threadID, req.Tasks)
		case "add":
			items := req.Tasks
			if req.Item != "" {
				items = append(items, req.Item)
			}
			for _, it := range items {
				if err = c.taskService.AddTask(ctx, threadID, it); err != nil {
					break
				}
			}
		case "start":
			target := req.Target
			if target == "" {
				target = req.Item
			}
			err = c.taskService.StartTask(ctx, threadID, target)
		case "done", "complete":
			target := req.Target
			if target == "" {
				target = req.Item
			}
			err = c.taskService.DoneTask(ctx, threadID, target)
		case "toggle":
			target := req.Target
			if target == "" {
				target = req.Item
			}
			existing, _ := c.taskService.ListPlanEntries(ctx, threadID)
			idx := findTaskIndex(existing, target)
			if idx >= 0 {
				if existing[idx].Status == "completed" || existing[idx].Status == "done" {
					err = c.taskService.StartTask(ctx, threadID, target)
				} else {
					err = c.taskService.DoneTask(ctx, threadID, target)
				}
			}
		case "remove", "delete":
			target := req.Target
			if target == "" {
				target = req.Item
			}
			err = c.taskService.RemoveTask(ctx, threadID, target)
		case "list":
			// read-only
		default:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(taskResponse{
				Status: "error",
				Error:  fmt.Sprintf("unknown action %q", req.Action),
			})
			return
		}

		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(taskResponse{
				Status: "error",
				Error:  err.Error(),
			})
			return
		}

		tasks, _ := c.taskService.ListPlanEntries(ctx, threadID)
		if c.taskUpdater != nil && req.Action != "list" {
			tasksCopy := make([]domain.PlanEntry, len(tasks))
			copy(tasksCopy, tasks)
			go c.taskUpdater(threadID, tasksCopy)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(taskResponse{
			Status: "ok",
			Tasks:  tasks,
		})
		return
	}

	c.taskMu.Lock()
	defer c.taskMu.Unlock()

	if threadID == "" {
		for tid := range c.tasks {
			threadID = tid
			break
		}
		if threadID == "" {
			threadID = "default"
		}
	}

	existing := c.tasks[threadID]

	switch req.Action {
	case "set":
		var next []domain.PlanEntry
		for _, t := range req.Tasks {
			t = strings.TrimSpace(t)
			if t != "" {
				next = append(next, domain.PlanEntry{
					Content: t,
					Status:  "pending",
				})
			}
		}
		existing = next

	case "add":
		items := req.Tasks
		if req.Item != "" {
			items = append(items, req.Item)
		}
		for _, t := range items {
			t = strings.TrimSpace(t)
			if t != "" {
				existing = append(existing, domain.PlanEntry{
					Content: t,
					Status:  "pending",
				})
			}
		}

	case "start":
		target := req.Target
		if target == "" {
			target = req.Item
		}
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			existing[idx].Status = "in_progress"
		}

	case "done", "complete":
		target := req.Target
		if target == "" {
			target = req.Item
		}
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			existing[idx].Status = "completed"
		}

	case "toggle":
		target := req.Target
		if target == "" {
			target = req.Item
		}
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			if existing[idx].Status == "completed" {
				existing[idx].Status = "pending"
			} else {
				existing[idx].Status = "completed"
			}
		}

	case "remove", "delete":
		target := req.Target
		if target == "" {
			target = req.Item
		}
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			existing = append(existing[:idx], existing[idx+1:]...)
		}

	case "list":
		// read-only

	default:
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(taskResponse{
			Status: "error",
			Error:  fmt.Sprintf("unknown action %q", req.Action),
			Tasks:  existing,
		})
		return
	}

	c.tasks[threadID] = existing
	if c.taskUpdater != nil && req.Action != "list" {
		updater := c.taskUpdater
		tasksCopy := make([]domain.PlanEntry, len(existing))
		copy(tasksCopy, existing)
		go updater(threadID, tasksCopy)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(taskResponse{
		Status: "ok",
		Tasks:  existing,
	})
}

func findTaskIndex(tasks []domain.PlanEntry, target string) int {
	target = strings.TrimSpace(target)
	if target == "" {
		return -1
	}
	if idx, err := strconv.Atoi(target); err == nil {
		if idx >= 1 && idx <= len(tasks) {
			return idx - 1
		}
		if idx >= 0 && idx < len(tasks) {
			return idx
		}
	}
	lower := strings.ToLower(target)
	for i, t := range tasks {
		if strings.ToLower(t.Content) == lower {
			return i
		}
	}
	for i, t := range tasks {
		if strings.Contains(strings.ToLower(t.Content), lower) {
			return i
		}
	}
	return -1
}

func (c *Control) GetTasks(threadID string) []domain.PlanEntry {
	if c.taskService != nil && threadID != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if tasks, err := c.taskService.ListPlanEntries(ctx, threadID); err == nil && len(tasks) > 0 {
			return tasks
		}
	}

	c.taskMu.Lock()
	defer c.taskMu.Unlock()
	tasks := c.tasks[threadID]
	out := make([]domain.PlanEntry, len(tasks))
	copy(out, tasks)
	return out
}

func (c *Control) MutateTask(threadID string, action string, target string, item string) []domain.PlanEntry {
	if c.taskService != nil && threadID != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		switch action {
		case "add":
			_ = c.taskService.AddTask(ctx, threadID, item)
		case "toggle":
			existing, _ := c.taskService.ListPlanEntries(ctx, threadID)
			idx := findTaskIndex(existing, target)
			if idx >= 0 {
				if existing[idx].Status == "completed" || existing[idx].Status == "done" {
					_ = c.taskService.StartTask(ctx, threadID, target)
				} else {
					_ = c.taskService.DoneTask(ctx, threadID, target)
				}
			}
		case "done", "complete":
			_ = c.taskService.DoneTask(ctx, threadID, target)
		case "start":
			_ = c.taskService.StartTask(ctx, threadID, target)
		case "remove", "delete":
			_ = c.taskService.RemoveTask(ctx, threadID, target)
		}

		tasks, err := c.taskService.ListPlanEntries(ctx, threadID)
		if err == nil {
			if c.taskUpdater != nil {
				tasksCopy := make([]domain.PlanEntry, len(tasks))
				copy(tasksCopy, tasks)
				go c.taskUpdater(threadID, tasksCopy)
			}
			return tasks
		}
	}

	c.taskMu.Lock()
	defer c.taskMu.Unlock()

	existing := c.tasks[threadID]
	switch action {
	case "add":
		item = strings.TrimSpace(item)
		if item != "" {
			existing = append(existing, domain.PlanEntry{Content: item, Status: "pending"})
		}
	case "toggle":
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			if existing[idx].Status == "completed" {
				existing[idx].Status = "pending"
			} else {
				existing[idx].Status = "completed"
			}
		}
	case "done", "complete":
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			existing[idx].Status = "completed"
		}
	case "start":
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			existing[idx].Status = "in_progress"
		}
	case "remove", "delete":
		idx := findTaskIndex(existing, target)
		if idx >= 0 {
			existing = append(existing[:idx], existing[idx+1:]...)
		}
	}
	c.tasks[threadID] = existing
	if c.taskUpdater != nil {
		updater := c.taskUpdater
		tasksCopy := make([]domain.PlanEntry, len(existing))
		copy(tasksCopy, existing)
		go updater(threadID, tasksCopy)
	}
	return existing
}

