package remote

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"composer/internal/domain"
	"composer/internal/session"
)

// ModelChoice is the provider, model and options the phone picked for a send.
type ModelChoice struct {
	Driver  string              `json:"driver"`
	Model   string              `json:"model"`
	Options domain.ModelOptions `json:"options,omitempty"`
}

// NewAgentRequest starts an agent from the phone.
type NewAgentRequest struct {
	Prompt      string           `json:"prompt"`
	Title       string           `json:"title,omitempty"`
	Cwd         string           `json:"cwd"`
	Choice      ModelChoice      `json:"choice"`
	AutoApprove bool             `json:"autoApprove"`
	Files       []domain.FileRef `json:"files,omitempty"`
}

// Hooks connect the phone API to app-level behaviour that lives outside the
// session layer (model switching with handoff, spawning with project
// context, provider discovery, attachment storage). All are optional.
type Hooks struct {
	Providers  func(force bool) []domain.ProviderSnapshot
	SendAgent  func(ctx context.Context, threadID, text string, files []domain.FileRef, choice *ModelChoice) error
	NewAgent   func(ctx context.Context, req NewAgentRequest) (string, error)
	SaveUpload func(name, mime, payload string) (domain.FileRef, error)
}

// SetHooks installs the app-level hooks.
func (s *Server) SetHooks(hooks Hooks) {
	s.mu.Lock()
	s.hooks = hooks
	s.mu.Unlock()
}

func (s *Server) currentHooks() Hooks {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.hooks
}

// ThreadSummary is one row of the phone's inbox: who is working, who needs
// an answer, and what they last said.
type ThreadSummary struct {
	ThreadID      string              `json:"threadId"`
	Title         string              `json:"title"`
	Kind          string              `json:"kind"` // "coordinator" | "agent"
	Driver        string              `json:"driver"`
	Model         string              `json:"model"`
	Options       domain.ModelOptions `json:"options,omitempty"`
	State         domain.TaskState    `json:"state,omitempty"`
	Cwd           string              `json:"cwd,omitempty"`
	ProjectCwd    string              `json:"projectCwd,omitempty"`
	ProjectName   string              `json:"projectName,omitempty"`
	Branch        string              `json:"branch,omitempty"`
	Live          bool                `json:"live"`
	Busy          bool                `json:"busy"`
	TurnStartedAt int64               `json:"turnStartedAt,omitempty"`
	LastTurnMs    int64               `json:"lastTurnMs,omitempty"`
	LastActivity  int64               `json:"lastActivity,omitempty"`
	Preview       string              `json:"preview,omitempty"`
	// Attention is "approval" or "question" while the agent waits on the user.
	Attention string `json:"attention,omitempty"`
}

// summarize derives live status from a transcript tail.
func summarize(summary *ThreadSummary, events []domain.RuntimeEvent) {
	if len(events) > 800 {
		events = events[len(events)-800:]
	}
	approvals := map[string]bool{}
	questions := []string{}
	var preview strings.Builder
	previewItem := ""
	for _, event := range events {
		if event.At > summary.LastActivity {
			summary.LastActivity = event.At
		}
		switch event.Kind {
		case domain.EventTurnStarted:
			summary.Busy = true
			summary.TurnStartedAt = event.At
		case domain.EventTurnCompleted, domain.EventTurnFailed:
			if summary.Busy && summary.TurnStartedAt > 0 && event.At >= summary.TurnStartedAt {
				summary.LastTurnMs = event.At - summary.TurnStartedAt
			}
			summary.Busy = false
			summary.TurnStartedAt = 0
			approvals = map[string]bool{}
			questions = questions[:0]
		case domain.EventSessionStopped:
			summary.Busy = false
			summary.TurnStartedAt = 0
		case domain.EventAgentMessage:
			key := event.TurnID + "|" + event.ItemID
			if !event.Delta || key != previewItem {
				preview.Reset()
				previewItem = key
			}
			preview.WriteString(event.Text)
		case domain.EventApprovalRequest:
			if event.Approval != nil {
				approvals[event.Approval.RequestID] = true
			}
		case domain.EventApprovalResolved:
			if event.Approval != nil {
				delete(approvals, event.Approval.RequestID)
			}
		case domain.EventQuestionAsked:
			if event.Question != nil {
				questions = append(questions, event.Question.RequestID)
			}
		case domain.EventQuestionAnswered:
			if event.Question != nil && event.Question.RequestID != "" {
				for i, id := range questions {
					if id == event.Question.RequestID {
						questions = append(questions[:i], questions[i+1:]...)
						break
					}
				}
			} else if len(questions) > 0 {
				questions = questions[:len(questions)-1]
			}
		}
	}
	switch {
	case len(questions) > 0:
		summary.Attention = "question"
	case len(approvals) > 0:
		summary.Attention = "approval"
	}
	text := strings.TrimSpace(preview.String())
	if len(text) > 240 {
		text = text[len(text)-240:]
	}
	summary.Preview = text
}

func projectName(path string) string {
	path = strings.TrimRight(strings.ReplaceAll(path, "\\", "/"), "/")
	if path == "" {
		return ""
	}
	return filepath.Base(filepath.FromSlash(path))
}

func (s *Server) threadSummaries() []ThreadSummary {
	out := make([]ThreadSummary, 0)

	coord := ThreadSummary{ThreadID: session.CoordinatorThreadID, Title: "Orchestrator", Kind: "coordinator", Live: true}
	if cfg, ok := s.coordinator.CurrentConfig(); ok {
		coord.Driver, coord.Model, coord.Options, coord.Cwd = cfg.Driver, cfg.Model, cfg.Options, cfg.Cwd
	} else if cfg := s.orchestrator.LastConfig(); cfg.Driver != "" {
		coord.Driver, coord.Model, coord.Options, coord.Cwd = cfg.Driver, cfg.Model, cfg.Options, cfg.Cwd
	}
	coord.ProjectName = projectName(coord.Cwd)
	events, _ := s.manager.HistorySnapshot(session.CoordinatorThreadID)
	summarize(&coord, events)
	out = append(out, coord)

	for _, agent := range s.orchestrator.ListAgents() {
		if agent.State == domain.TaskClosed && !agent.Live {
			continue
		}
		row := ThreadSummary{
			ThreadID: agent.ThreadID, Title: agent.Title, Kind: "agent",
			Driver: string(agent.Driver), Model: agent.Model, State: agent.State,
			Cwd: agent.Cwd, ProjectCwd: agent.ProjectCwd, ProjectName: projectName(agent.ProjectCwd),
			Branch: agent.Branch, Live: agent.Live,
		}
		events, _ := s.manager.HistorySnapshot(agent.ThreadID)
		summarize(&row, events)
		if row.LastActivity == 0 {
			row.LastActivity = s.manager.LastActivity(agent.ThreadID)
		}
		out = append(out, row)
	}
	sort.SliceStable(out[1:], func(i, j int) bool { return out[1+i].LastActivity > out[1+j].LastActivity })
	return out
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func (s *Server) handleThreads(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.threadSummaries())
}

// handleThread returns a thread's transcript plus the highest seq it holds,
// so the phone applies only live events that come after the snapshot.
func (s *Server) handleThread(w http.ResponseWriter, r *http.Request) {
	threadID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/thread/"), "/")
	if threadID == "" {
		writeError(w, http.StatusBadRequest, errors.New("missing thread id"))
		return
	}
	events, lastSeq := s.manager.HistorySnapshot(threadID)
	if len(events) == 0 {
		events, lastSeq = s.threadHistory(threadID), 0
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "lastSeq": lastSeq})
}

func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks()
	if hooks.Providers == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	type model struct {
		ID      string                    `json:"id"`
		Name    string                    `json:"name"`
		Default bool                      `json:"default,omitempty"`
		Options []domain.OptionDescriptor `json:"options,omitempty"`
	}
	type provider struct {
		Driver string  `json:"driver"`
		Name   string  `json:"name"`
		Models []model `json:"models"`
	}
	out := make([]provider, 0)
	for _, snap := range hooks.Providers(r.URL.Query().Get("refresh") == "1") {
		if snap.Availability != domain.AvailabilityReady || len(snap.Models) == 0 {
			continue
		}
		p := provider{Driver: string(snap.Driver), Name: snap.DisplayName}
		for _, m := range snap.Models {
			p.Models = append(p.Models, model{ID: m.ID, Name: firstNonEmpty(m.DisplayName, m.ID), Default: m.Default, Options: m.Options})
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

type sendBody struct {
	ThreadID string           `json:"threadId"`
	Text     string           `json:"text"`
	Files    []domain.FileRef `json:"files,omitempty"`
	Choice   *ModelChoice     `json:"choice,omitempty"`
}

func (s *Server) handleThreadSend(w http.ResponseWriter, r *http.Request) {
	var body sendBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ThreadID == "" ||
		(strings.TrimSpace(body.Text) == "" && len(body.Files) == 0) {
		writeError(w, http.StatusBadRequest, errors.New("threadId and text are required"))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if body.ThreadID == session.CoordinatorThreadID {
		cfg := s.currentCoordinatorConfig()
		if c := body.Choice; c != nil && c.Driver != "" {
			cfg.Driver, cfg.Model, cfg.Options = c.Driver, c.Model, c.Options
		}
		s.orchestrator.Remember(cfg)
		turnID, err := s.coordinator.SendWithFiles(ctx, cfg, body.Text, body.Files)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"turnId": turnID})
		return
	}

	if hook := s.currentHooks().SendAgent; hook != nil {
		if err := hook(ctx, body.ThreadID, body.Text, body.Files, body.Choice); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if _, err := s.sendAgent(ctx, body.ThreadID, body.Text); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleThreadInterrupt(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ThreadID string `json:"threadId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ThreadID == "" {
		writeError(w, http.StatusBadRequest, errors.New("threadId is required"))
		return
	}
	var err error
	if body.ThreadID == session.CoordinatorThreadID {
		err = s.coordinator.Interrupt(context.Background())
	} else {
		err = s.manager.Interrupt(context.Background(), body.ThreadID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleNewAgent(w http.ResponseWriter, r *http.Request) {
	var req NewAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Prompt) == "" {
		writeError(w, http.StatusBadRequest, errors.New("prompt is required"))
		return
	}
	hook := s.currentHooks().NewAgent
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errors.New("starting agents is not available"))
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	threadID, err := hook(ctx, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"threadId": threadID})
}

// maxUploadBody bounds a base64 upload request (images are resized on the
// phone before upload, so this is generous).
const maxUploadBody = 24 << 20

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	hook := s.currentHooks().SaveUpload
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errors.New("uploads are not available"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBody)
	var body struct {
		Name string `json:"name"`
		MIME string `json:"mime"`
		Data string `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Data == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid upload"))
		return
	}
	ref, err := hook(body.Name, body.MIME, body.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, ref)
}
