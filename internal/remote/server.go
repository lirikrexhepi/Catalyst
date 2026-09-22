package remote

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"composer/internal/domain"
	"composer/internal/history"
	"composer/internal/logger"
	"composer/internal/projects"
	"composer/internal/session"

	"github.com/gorilla/websocket"
)

//go:embed all:mobile/dist
var webAssets embed.FS

type Server struct {
	mu           sync.RWMutex
	port         int
	auth         *AuthManager
	tunnel       *TunnelManager
	listener     net.Listener
	httpServer   *http.Server
	clients      map[*websocket.Conn]bool
	upgrader     websocket.Upgrader
	manager      *session.Manager
	coordinator  *session.Coordinator
	orchestrator *session.Constructor
	spawner      *session.Spawner
	projects     *projects.Store
	recorder     *history.Recorder
	history      *history.Store
	cancelFeed   func()
	running      bool
	hooks        Hooks
	previews     *PreviewManager
}

func NewServer(
	port int,
	manager *session.Manager,
	coordinator *session.Coordinator,
	orchestrator *session.Constructor,
	spawner *session.Spawner,
	projectsStore *projects.Store,
	recorder *history.Recorder,
	historyStore *history.Store,
) *Server {
	if port <= 0 {
		port = 4545
	}
	return &Server{
		port:         port,
		auth:         NewAuthManager(),
		tunnel:       NewTunnelManager(port),
		previews:     NewPreviewManager(port),
		clients:      make(map[*websocket.Conn]bool),
		manager:      manager,
		coordinator:  coordinator,
		orchestrator: orchestrator,
		spawner:      spawner,
		projects:     projectsStore,
		recorder:     recorder,
		history:      historyStore,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allows mobile phone connecting over local LAN, Tailscale, or Cloudflare tunnel
			},
		},
	}
}

func (s *Server) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", s.port))
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("remote server failed to bind port %d: %w", s.port, err)
	}

	s.listener = listener
	s.running = true
	s.mu.Unlock()

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpServer = &http.Server{
		Handler:      corsMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// Start background event pump from orchestrator manager bus to connected phones
	events, cancel := s.manager.Bus().Subscribe()
	s.cancelFeed = cancel
	go s.broadcastEvents(events)

	// Publish through Tailscale Funnel for stable worldwide access
	go s.tunnel.StartPublicTunnel(ctx)

	go func() {
		logger.Infof("RemoteServer", "Mobile remote gateway listening on 0.0.0.0:%d", s.port)
		if err := s.httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			logger.Errorf("RemoteServer", "HTTP server exited with error: %v", err)
		}
	}()

	return nil
}

func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	if s.cancelFeed != nil {
		s.cancelFeed()
	}

	s.tunnel.Stop()

	if s.previews != nil {
		s.previews.StopAll()
	}

	if s.httpServer != nil {
		_ = s.httpServer.Close()
	}
	if s.listener != nil {
		_ = s.listener.Close()
	}

	for client := range s.clients {
		_ = client.Close()
	}
	s.clients = make(map[*websocket.Conn]bool)
	s.running = false
	logger.Infof("RemoteServer", "Remote server stopped")
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	// Static web assets (SPA — serve index.html for all non-asset routes)
	webContent, err := fs.Sub(webAssets, "mobile/dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(webContent))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// Auto-set cookie if authenticated via URL param
			if token := r.URL.Query().Get("token"); token != "" && s.auth.Validate(token) {
				http.SetCookie(w, &http.Cookie{
					Name:     CookieName,
					Value:    token,
					Path:     "/",
					Expires:  time.Now().Add(30 * 24 * time.Hour),
					SameSite: http.SameSiteLaxMode,
				})
			}
			// For SPA: serve index.html for routes that don't match a real file
			path := r.URL.Path
			if path != "/" && !strings.HasPrefix(path, "/assets/") &&
				!strings.HasSuffix(path, ".svg") && !strings.HasSuffix(path, ".json") &&
				!strings.HasSuffix(path, ".png") && !strings.HasSuffix(path, ".ico") {
				// Try to open the file; if not found, serve index.html
				if f, ferr := webContent.Open(strings.TrimPrefix(path, "/")); ferr != nil {
					r.URL.Path = "/"
				} else {
					_ = f.Close()
				}
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	// API routes
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/history", s.requireAuth(s.handleHistory))
	mux.HandleFunc("/api/agents", s.requireAuth(s.handleAgents))
	mux.HandleFunc("/api/projects", s.requireAuth(s.handleProjects))
	mux.HandleFunc("/api/agent/", s.requireAuth(s.handleAgentHistory))
	mux.HandleFunc("/api/coordinator/send", s.requireAuth(s.handleSendCoordinator))
	mux.HandleFunc("/api/coordinator/interrupt", s.requireAuth(s.handleInterruptCoordinator))
	mux.HandleFunc("/api/coordinator/new", s.requireAuth(s.handleNewCoordinator))
	mux.HandleFunc("/api/agent/send", s.requireAuth(s.handleSendAgent))
	mux.HandleFunc("/api/agent/stop", s.requireAuth(s.handleStopAgent))
	mux.HandleFunc("/api/approve", s.requireAuth(s.handleApprove))
	mux.HandleFunc("/api/question/answer", s.requireAuth(s.handleAnswerQuestion))
	mux.HandleFunc("/api/plan/execute", s.requireAuth(s.handleExecutePlan))
	mux.HandleFunc("/api/threads", s.requireAuth(s.handleThreads))
	mux.HandleFunc("/api/thread/", s.requireAuth(s.handleThread))
	mux.HandleFunc("/api/models", s.requireAuth(s.handleModels))
	mux.HandleFunc("/api/send", s.requireAuth(s.handleThreadSend))
	mux.HandleFunc("/api/interrupt", s.requireAuth(s.handleThreadInterrupt))
	mux.HandleFunc("/api/agent/new", s.requireAuth(s.handleNewAgent))
	mux.HandleFunc("/api/upload", s.requireAuth(s.handleUpload))
	mux.HandleFunc("/api/servers", s.requireAuth(s.handleServers))
	mux.HandleFunc("/api/preview/start", s.requireAuth(s.handlePreviewStart))
	mux.HandleFunc("/api/preview/stop", s.requireAuth(s.handlePreviewStop))
	mux.HandleFunc("/api/ws", s.handleWebSocket)
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.auth.AuthenticateRequest(r) {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !s.auth.AuthenticateRequest(r) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": false})
		return
	}

	activeProj := ""
	if s.projects != nil {
		if p, ok := s.projects.Active(); ok {
			activeProj = p.Name
		}
	}

	agents := s.orchestrator.ListAgents()
	running := 0
	for _, a := range agents {
		if a.State == domain.TaskRunning {
			running++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(RemoteStatus{
		Project:       activeProj,
		TotalAgents:   len(agents),
		RunningAgents: running,
	})
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	events := s.threadHistory(session.CoordinatorThreadID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(events)
}

// threadHistory prefers live memory, then falls back to the on-disk history
// store. Memory alone goes blank for finished threads and after restarts,
// which is why chat history used to show nothing.
func (s *Server) threadHistory(threadID string) []domain.RuntimeEvent {
	if live := s.manager.History(threadID); len(live) > 0 {
		return live
	}
	if s.recorder == nil || s.history == nil {
		return []domain.RuntimeEvent{}
	}
	workspaceID, ok := s.recorder.WorkspaceOf(threadID)
	if !ok {
		if threadID == session.CoordinatorThreadID {
			return s.coordinator.History()
		}
		return []domain.RuntimeEvent{}
	}
	loaded, err := s.history.Load(workspaceID)
	if err != nil {
		return []domain.RuntimeEvent{}
	}
	if events, ok := loaded.Transcripts[threadID]; ok {
		return events
	}
	return []domain.RuntimeEvent{}
}

func (s *Server) handleAgents(w http.ResponseWriter, r *http.Request) {
	views := s.visibleAgents()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(views)
}

// visibleAgents mirrors the desktop: finished workspaces that are no longer
// live are history, not chats. Without this the phone fills with phantom
// projects whose stored state still says "running".
func (s *Server) visibleAgents() []RemoteAgentView {
	agents := s.orchestrator.ListAgents()
	views := make([]RemoteAgentView, 0, len(agents))
	for _, a := range agents {
		if a.State == domain.TaskClosed && !a.Live {
			continue
		}
		views = append(views, RemoteAgentView{
			ThreadID:   a.ThreadID,
			Title:      a.Title,
			Driver:     string(a.Driver),
			Model:      a.Model,
			State:      a.State,
			Cwd:        a.Cwd,
			ProjectCwd: a.ProjectCwd,
			Branch:     a.Branch,
			Live:       a.Live,
		})
	}
	return views
}

// handleProjects returns the user's real projects from the projects store —
// the same list the desktop shows — with their live agents attached.
// Running means a live session in TaskRunning state; stored states from old
// workspaces are never trusted, which is what used to paint phantom projects.
func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	type projectEntry struct {
		ID            string            `json:"id"`
		Name          string            `json:"name"`
		Path          string            `json:"path"`
		Agents        []RemoteAgentView `json:"agents"`
		TotalAgents   int               `json:"totalAgents"`
		RunningAgents int               `json:"runningAgents"`
		LastActivity  int64             `json:"lastActivity"`
	}
	agents := s.visibleAgents()

	out := make([]*projectEntry, 0)
	if s.projects != nil {
		for _, p := range s.projects.List() {
			e := &projectEntry{ID: p.ID, Name: p.Name, Path: p.Path, Agents: []RemoteAgentView{}}
			for _, a := range agents {
				if !underPath(a.ProjectCwd, p.Path) && !underPath(a.Cwd, p.Path) {
					continue
				}
				e.Agents = append(e.Agents, a)
				e.TotalAgents++
				if a.Live && a.State == domain.TaskRunning {
					e.RunningAgents++
				}
				if at := s.manager.LastActivity(a.ThreadID); at > e.LastActivity {
					e.LastActivity = at
				}
			}
			out = append(out, e)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func underPath(child, parent string) bool {
	if child == "" || parent == "" {
		return false
	}
	lc, lp := strings.ToLower(child), strings.ToLower(parent)
	if lc == lp {
		return true
	}
	if !strings.HasPrefix(lc, lp) {
		return false
	}
	sep := lc[len(lp)]
	return sep == '/' || sep == '\\'
}

// handleAgentHistory returns the event history for a specific agent thread.
// URL pattern: /api/agent/{threadId}/history
func (s *Server) handleAgentHistory(w http.ResponseWriter, r *http.Request) {
	// Parse threadId from path: /api/agent/<threadId>/history
	path := strings.TrimPrefix(r.URL.Path, "/api/agent/")
	path = strings.TrimSuffix(path, "/history")
	threadID := strings.TrimSuffix(path, "/")
	if threadID == "" {
		http.Error(w, `{"error":"missing threadId"}`, http.StatusBadRequest)
		return
	}
	events := s.threadHistory(threadID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(events)
}

func (s *Server) handleSendCoordinator(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Text == "" {
		http.Error(w, `{"error":"invalid text"}`, http.StatusBadRequest)
		return
	}

	cfg := s.currentCoordinatorConfig()
	s.orchestrator.Remember(cfg)
	turnID, err := s.coordinator.Send(context.Background(), cfg, body.Text)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"turnId": turnID})
}

func (s *Server) handleInterruptCoordinator(w http.ResponseWriter, r *http.Request) {
	_ = s.coordinator.Interrupt(context.Background())
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleExecutePlan(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Tasks []PlanTaskItem `json:"tasks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Tasks) == 0 {
		http.Error(w, `{"error":"no tasks"}`, http.StatusBadRequest)
		return
	}

	go s.dispatchPlanTasks(body.Tasks)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleSendAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	var body struct {
		ThreadID string `json:"threadId"`
		Text     string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ThreadID == "" || body.Text == "" {
		http.Error(w, `{"error":"threadId and text required"}`, http.StatusBadRequest)
		return
	}
	turnID, err := s.sendAgent(context.Background(), body.ThreadID, body.Text)
	if err != nil {
		if strings.Contains(err.Error(), "no active session") {
			http.Error(w, `{"error":"session_ended"}`, http.StatusGone)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"turnId": turnID})
}

func (s *Server) handleStopAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	var body struct {
		ThreadID string `json:"threadId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ThreadID == "" {
		http.Error(w, `{"error":"threadId required"}`, http.StatusBadRequest)
		return
	}
	_ = s.manager.Stop(context.Background(), body.ThreadID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleNewCoordinator(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	_ = s.coordinator.Reset(context.Background())
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleApprove(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	var body struct {
		ThreadID  string `json:"threadId"`
		RequestID string `json:"requestId"`
		Decision  string `json:"decision"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ThreadID == "" || body.RequestID == "" {
		http.Error(w, `{"error":"threadId, requestId required"}`, http.StatusBadRequest)
		return
	}
	if body.Decision == "" {
		body.Decision = "allowOnce"
	}
	if err := s.manager.Respond(context.Background(), body.ThreadID, body.RequestID, domain.ApprovalDecision(body.Decision)); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleAnswerQuestion(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		return
	}
	var body struct {
		ThreadID  string   `json:"threadId"`
		RequestID string   `json:"requestId"`
		Answers   []string `json:"answers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ThreadID == "" || body.RequestID == "" {
		http.Error(w, `{"error":"threadId, requestId required"}`, http.StatusBadRequest)
		return
	}
	if err := s.manager.RespondQuestion(context.Background(), body.ThreadID, body.RequestID, body.Answers); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	if !s.auth.AuthenticateRequest(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	s.mu.Lock()
	s.clients[conn] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		_ = conn.Close()
	}()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg ClientMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			continue
		}
		s.handleClientAction(msg)
	}
}

func (s *Server) handleClientAction(msg ClientMessage) {
	ctx := context.Background()
	switch msg.Action {
	case "send_coordinator":
		if msg.Text != "" {
			cfg := s.currentCoordinatorConfig()
			if msg.Model != "" {
				cfg.Model = msg.Model
			}
			if msg.Driver != "" {
				cfg.Driver = msg.Driver
			}
			s.orchestrator.Remember(cfg)
			if _, err := s.coordinator.Send(ctx, cfg, msg.Text); err != nil {
				s.publishSendError(session.CoordinatorThreadID, err)
			}
		}
	case "interrupt_coordinator":
		_ = s.coordinator.Interrupt(ctx)
	case "execute_plan":
		if len(msg.Tasks) > 0 {
			go s.dispatchPlanTasks(msg.Tasks)
		}
	case "send_agent":
		if msg.ThreadID != "" && msg.Text != "" {
			if _, err := s.sendAgent(ctx, msg.ThreadID, msg.Text); err != nil {
				s.publishSendError(msg.ThreadID, err)
			}
		}
	case "stop_agent":
		if msg.ThreadID != "" {
			_ = s.manager.Stop(ctx, msg.ThreadID)
		}
	case "new_chat":
		_ = s.coordinator.Reset(ctx)
	case "approve":
		if msg.ThreadID != "" && msg.RequestID != "" {
			decision := msg.Decision
			if decision == "" {
				decision = "allowOnce"
			}
			if err := s.manager.Respond(ctx, msg.ThreadID, msg.RequestID, domain.ApprovalDecision(decision)); err != nil {
				s.publishSendError(msg.ThreadID, err)
			}
		}
	case "answer_question":
		if msg.ThreadID != "" && msg.RequestID != "" {
			if err := s.manager.RespondQuestion(ctx, msg.ThreadID, msg.RequestID, msg.Answers); err != nil {
				s.publishSendError(msg.ThreadID, err)
			}
		}
	}
}

// sendAgent delivers a message to a worker, starting its CLI first (resuming
// the stored conversation) when it is not running, the same as the desktop.
func (s *Server) sendAgent(ctx context.Context, threadID, text string) (string, error) {
	if err := s.orchestrator.EnsureLive(ctx, threadID); err != nil {
		return "", err
	}
	turnID := fmt.Sprintf("%s-turn-%d", threadID, time.Now().UnixMilli())
	s.manager.RecordUserMessage(threadID, turnID, text)
	if err := s.manager.Send(ctx, domain.SendTurnInput{
		ThreadID: threadID,
		TurnID:   turnID,
		Text:     text,
	}); err != nil {
		return "", err
	}
	return turnID, nil
}

func (s *Server) publishSendError(threadID string, err error) {
	if err == nil {
		return
	}
	s.manager.Bus().Publish(domain.RuntimeEvent{
		Kind:     domain.EventTurnFailed,
		ThreadID: threadID,
		Error:    err.Error(),
		At:       time.Now().UnixMilli(),
	})
}

func (s *Server) dispatchPlanTasks(tasks []PlanTaskItem) {
	cfg := s.currentCoordinatorConfig()
	requests := make([]session.SpawnRequest, 0, len(tasks))
	for _, t := range tasks {
		cwd := t.Cwd
		if cwd == "" {
			cwd = cfg.Cwd
		}
		model := t.Model
		if model == "" {
			model = cfg.Model
		}
		requests = append(requests, session.SpawnRequest{
			Title:  t.Title,
			Prompt: t.Prompt,
			Driver: domain.DriverKind(cfg.Driver),
			Model:  model,
			Cwd:    cwd,
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	titles := make([]string, 0, len(tasks))
	for _, t := range tasks {
		titles = append(titles, t.Title)
	}

	_, err := s.spawner.Spawn(ctx, requests, session.SpawnOptions{
		Driver:      domain.DriverKind(cfg.Driver),
		Model:       cfg.Model,
		Options:     cfg.Options,
		Cwd:         cfg.Cwd,
		UseWorktree: true,
		Title:       tasks[0].Title,
		Prompt:      strings.Join(titles, ", "),
		Permission:  cfg.Permission,
	})
	if err != nil {
		s.manager.Bus().Publish(domain.RuntimeEvent{
			Kind:     domain.EventTurnFailed,
			ThreadID: session.CoordinatorThreadID,
			Error:    "Remote spawn failed: " + err.Error(),
			At:       time.Now().UnixMilli(),
		})
	}
}

// currentCoordinatorConfig reuses the desktop's live coordinator selection
// so a message from the phone never restarts that session with another model.
func (s *Server) currentCoordinatorConfig() session.Config {
	if cfg, ok := s.coordinator.CurrentConfig(); ok {
		return cfg
	}
	if cfg := s.orchestrator.LastConfig(); cfg.Driver != "" {
		return cfg
	}
	cwd := ""
	if s.projects != nil {
		cwd = s.projects.ActivePath()
	}
	if cwd == "" {
		if wd, err := os.Getwd(); err == nil {
			cwd = wd
		}
	}
	return session.Config{
		Driver:     string(domain.DriverClaude),
		Cwd:        cwd,
		Permission: domain.PermissionPlan,
	}
}

// broadcastEvents fans events out to phones in batches (every
// broadcastInterval, consecutive deltas of one item pre-merged). Writes
// happen outside the server lock with a deadline, so one stalled phone can
// neither block Stop nor back the event bus up; a client that cannot keep
// up is dropped and reconnects on its own.
func (s *Server) broadcastEvents(events <-chan domain.RuntimeEvent) {
	ticker := time.NewTicker(broadcastInterval)
	defer ticker.Stop()
	batch := make([]domain.RuntimeEvent, 0, 128)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		payload, err := json.Marshal(ServerMessage{Type: "events", Events: batch})
		batch = make([]domain.RuntimeEvent, 0, 128)
		if err != nil {
			return
		}
		s.mu.RLock()
		clients := make([]*websocket.Conn, 0, len(s.clients))
		for client := range s.clients {
			clients = append(clients, client)
		}
		s.mu.RUnlock()

		for _, client := range clients {
			_ = client.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := client.WriteMessage(websocket.TextMessage, payload); err != nil {
				s.mu.Lock()
				delete(s.clients, client)
				s.mu.Unlock()
				_ = client.Close()
			}
		}
	}

	for {
		select {
		case event, ok := <-events:
			if !ok {
				flush()
				return
			}
			if n := len(batch); n > 0 && event.Delta && continuesItem(batch[n-1], event) {
				batch[n-1].Text += event.Text
				batch[n-1].Seq = event.Seq
			} else {
				batch = append(batch, event)
			}
			if len(batch) >= 256 {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

const broadcastInterval = 40 * time.Millisecond

func continuesItem(prev, next domain.RuntimeEvent) bool {
	return prev.Delta && prev.Kind == next.Kind && prev.ThreadID == next.ThreadID &&
		prev.TurnID == next.TurnID && prev.ItemID == next.ItemID &&
		(next.Kind == domain.EventAgentMessage || next.Kind == domain.EventAgentThought)
}

func (s *Server) Info() RemoteInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	token := s.auth.Token()
	pin := s.auth.PIN()
	public, best, connecting, downloading, lastError := s.tunnel.Status(token)

	var qrSVG string
	if best != "" {
		qrSVG, _ = GenerateQRCodePNG(best)
	}
	hostname, _ := os.Hostname()

	return RemoteInfo{
		Enabled:       s.running,
		Port:          s.port,
		Token:         token,
		PIN:           pin,
		PublicURL:     public,
		BestURL:       best,
		QRCodeSVG:     qrSVG,
		ActiveClients: len(s.clients),
		Hostname:      hostname,
		Connecting:    connecting,
		Downloading:   downloading,
		Error:         lastError,
	}
}

func (s *Server) RegenerateToken() RemoteInfo {
	s.auth.Regenerate()
	return s.Info()
}
