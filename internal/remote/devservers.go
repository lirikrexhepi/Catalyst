package remote

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

var errDevServersUnavailable = errors.New("starting dev servers is not available")

var ErrNoDevScript = errors.New("no dev, start or serve script was found in this project's package.json files")

type DevServerRequest struct {
	ThreadID string `json:"threadId,omitempty"`
	Cwd      string `json:"cwd,omitempty"`
}

type DevServerInfo struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Command string   `json:"command"`
	Cwd     string   `json:"cwd"`
	Port    int      `json:"port,omitempty"`
	Status  string   `json:"status"`
	Log     []string `json:"log,omitempty"`
}

type DevServerHooks struct {
	Start  func(ctx context.Context, req DevServerRequest) (DevServerInfo, error)
	Status func(id string) (DevServerInfo, bool)
	Stop   func(pid int) error
}

func (s *Server) handleDevServerStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("POST only"))
		return
	}
	hooks := s.currentHooks().DevServers
	if hooks.Start == nil {
		writeError(w, http.StatusServiceUnavailable, errDevServersUnavailable)
		return
	}
	var req DevServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.ThreadID == "" && strings.TrimSpace(req.Cwd) == "") {
		writeError(w, http.StatusBadRequest, errors.New("threadId or cwd is required"))
		return
	}
	info, err := hooks.Start(r.Context(), req)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrNoDevScript) {
			status = http.StatusUnprocessableEntity
		}
		writeError(w, status, err)
		return
	}
	if info.Port > 0 {
		s.WarmPreview(info.Port)
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleDevServerStatus(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks().DevServers
	if hooks.Status == nil {
		writeError(w, http.StatusServiceUnavailable, errDevServersUnavailable)
		return
	}
	info, ok := hooks.Status(r.URL.Query().Get("id"))
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("dev server not found"))
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleDevServerStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("POST only"))
		return
	}
	hooks := s.currentHooks().DevServers
	if hooks.Stop == nil {
		writeError(w, http.StatusServiceUnavailable, errDevServersUnavailable)
		return
	}
	var body struct {
		PID  int `json:"pid"`
		Port int `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PID <= 0 {
		writeError(w, http.StatusBadRequest, errors.New("pid is required"))
		return
	}
	if err := hooks.Stop(body.PID); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if s.previews != nil && body.Port > 0 {
		s.previews.Stop(body.Port)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) WarmPreview(port int) {
	if s.previews == nil || port <= 0 {
		return
	}
	go func() { _, _ = s.previews.Start(port) }()
}
