package remote

import (
	"crypto/subtle"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
)

// LocalControlHeader carries the instance secret on local control requests.
const LocalControlHeader = "X-Orchestrator-Instance"

// LocalControl lets another copy of the app on this PC (the desktop window)
// ask a headless instance to step aside. Tailscale Funnel delivers phone
// traffic from 127.0.0.1 too, so loopback alone proves nothing; the secret,
// which only exists in this user's config directory, is what authorises it.
type LocalControl struct {
	Secret string
	Stop   func()
}

// SetLocalControl enables the local control endpoints. Without it they 404.
func (s *Server) SetLocalControl(control *LocalControl) {
	s.mu.Lock()
	s.local = control
	s.mu.Unlock()
}

func (s *Server) localControl(r *http.Request) (*LocalControl, bool) {
	s.mu.RLock()
	control := s.local
	s.mu.RUnlock()
	if control == nil || control.Secret == "" || !isLoopback(r.RemoteAddr) {
		return nil, false
	}
	given := r.Header.Get(LocalControlHeader)
	if subtle.ConstantTimeCompare([]byte(given), []byte(control.Secret)) != 1 {
		return nil, false
	}
	return control, true
}

func isLoopback(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

func (s *Server) handleLocalInstance(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.localControl(r); !ok {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pid": os.Getpid(), "mode": "headless"})
}

func (s *Server) handleLocalShutdown(w http.ResponseWriter, r *http.Request) {
	control, ok := s.localControl(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	if control.Stop != nil {
		control.Stop()
	}
}

// handleSystemShutdown powers the PC off from the phone. The body must say so
// explicitly, so a stray or replayed request with no body does nothing.
func (s *Server) handleSystemShutdown(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	powerOff := s.currentHooks().PowerOff
	if powerOff == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "shutdown is only available when the app runs headless"})
		return
	}
	var body struct {
		Confirm string `json:"confirm"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body); err != nil || body.Confirm != "shutdown" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": `send {"confirm":"shutdown"}`})
		return
	}
	if err := powerOff(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
