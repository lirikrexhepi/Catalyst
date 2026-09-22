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
	cancelFeed   func()
	running      bool
}

func NewServer(
	port int,
	manager *session.Manager,
	coordinator *session.Coordinator,
	orchestrator *session.Constructor,
	spawner *session.Spawner,
	projectsStore *projects.Store,
) *Server {
	if port <= 0 {
		port = 4545
	}
	return &Server{
		port:         port,
		auth:         NewAuthManager(),
		tunnel:       NewTunnelManager(port),
		clients:      make(map[*websocket.Conn]bool),
		manager:      manager,
		coordinator:  coordinator,
		orchestrator: orchestrator,
		spawner:      spawner,
		projects:     projectsStore,
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
	events := s.coordinator.History()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(events)
}

func (s *Server) handleAgents(w http.ResponseWriter, r *http.Request) {
	agents := s.orchestrator.ListAgents()
	views := make([]RemoteAgentView, 0, len(agents))
	for _, a := range agents {
		views = append(views, RemoteAgentView{
			ThreadID: a.ThreadID,
			Title:    a.Title,
			Driver:   string(a.Driver),
			Model:    a.Model,
			State:    a.State,
			Cwd:      a.Cwd,
			Branch:   a.Branch,
			Live:     a.Live,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(views)
}

// handleProjects groups agents by their working directory and returns a summary per project.
// NOTE: This is a lightweight client-side-derivable grouping. A dedicated projects store
// endpoint should be evaluated in the future for richer metadata (branch info, project config, etc.).
func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	agents := s.orchestrator.ListAgents()
	type projectEntry struct {
		Name          string            `json:"name"`
		Path          string            `json:"path"`
		Agents        []RemoteAgentView `json:"agents"`
		TotalAgents   int               `json:"totalAgents"`
		RunningAgents int               `json:"runningAgents"`
		LastActivity  int64             `json:"lastActivity"`
	}
	byPath := make(map[string]*projectEntry)
	for _, a := range agents {
		e, ok := byPath[a.Cwd]
		if !ok {
			name := a.Cwd
			if idx := strings.LastIndexAny(a.Cwd, `/\`); idx >= 0 {
				name = a.Cwd[idx+1:]
			}
			e = &projectEntry{Name: name, Path: a.Cwd}
			byPath[a.Cwd] = e
		}
		view := RemoteAgentView{
			ThreadID: a.ThreadID, Title: a.Title, Driver: string(a.Driver),
			Model: a.Model, State: a.State, Cwd: a.Cwd, Branch: a.Branch, Live: a.Live,
		}
		e.Agents = append(e.Agents, view)
		e.TotalAgents++
		if a.State == "running" {
			e.RunningAgents++
		}
	}
	out := make([]*projectEntry, 0, len(byPath))
	for _, e := range byPath {
		out = append(out, e)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
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
	events := s.manager.History(threadID)
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
	turnID := fmt.Sprintf("%s-turn-%d", body.ThreadID, time.Now().UnixMilli()%100000)
	s.manager.RecordUserMessage(body.ThreadID, turnID, body.Text)
	if err := s.manager.Send(context.Background(), domain.SendTurnInput{
		ThreadID: body.ThreadID,
		TurnID:   turnID,
		Text:     body.Text,
	}); err != nil {
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
			_, _ = s.coordinator.Send(ctx, cfg, msg.Text)
		}
	case "interrupt_coordinator":
		_ = s.coordinator.Interrupt(ctx)
	case "execute_plan":
		if len(msg.Tasks) > 0 {
			go s.dispatchPlanTasks(msg.Tasks)
		}
	case "send_agent":
		if msg.ThreadID != "" && msg.Text != "" {
			turnID := fmt.Sprintf("%s-turn-%d", msg.ThreadID, time.Now().UnixMilli()%100000)
			s.manager.RecordUserMessage(msg.ThreadID, turnID, msg.Text)
			if err := s.manager.Send(ctx, domain.SendTurnInput{
				ThreadID: msg.ThreadID,
				TurnID:   turnID,
				Text:     msg.Text,
			}); err != nil {
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

func (s *Server) currentCoordinatorConfig() session.Config {
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
		Model:      "claude-haiku-4-5",
		Cwd:        cwd,
		Permission: domain.PermissionPlan,
	}
}

func (s *Server) broadcastEvents(events <-chan domain.RuntimeEvent) {
	for event := range events {
		msg := ServerMessage{
			Type:  "event",
			Event: &event,
		}
		payload, err := json.Marshal(msg)
		if err != nil {
			continue
		}

		s.mu.RLock()
		for client := range s.clients {
			_ = client.WriteMessage(websocket.TextMessage, payload)
		}
		s.mu.RUnlock()
	}
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
