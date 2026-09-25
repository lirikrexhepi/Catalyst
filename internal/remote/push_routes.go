package remote

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

func (s *Server) publicURL() string {
	s.tunnel.mu.RLock()
	defer s.tunnel.mu.RUnlock()
	return s.tunnel.publicURL
}

const presenceTTL = 25 * time.Second

func (s *Server) viewing(threadID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.presence {
		if p.visible && p.threadID == threadID && time.Since(p.at) < presenceTTL {
			return true
		}
	}
	return false
}

func (s *Server) handlePushKey(w http.ResponseWriter, r *http.Request) {
	key, err := s.notifier.PublicKey()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"publicKey": key})
}

func (s *Server) handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, errors.New("POST only"))
		return
	}
	var body struct {
		Subscription PushSubscription `json:"subscription"`
		Prefs        PushPrefs        `json:"prefs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.notifier.Subscribe(body.Subscription, body.Prefs, deviceName(r.UserAgent())); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusBadRequest, errors.New("endpoint is required"))
		return
	}
	if err := s.notifier.Unsubscribe(body.Endpoint); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handlePushTest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusBadRequest, errors.New("endpoint is required"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := s.notifier.Test(ctx, body.Endpoint); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
