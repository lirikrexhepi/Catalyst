package remote

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"composer/internal/servers"
)

func TestQuickTunnelURLParsing(t *testing.T) {
	line := "2026-09-22T10:00:00Z INF Your quick Tunnel has been created! Visit it at (press q to quit): https://brave-tiger-finch.trycloudflare.com"
	url := quickTunnelURL.FindString(line)
	if url != "https://brave-tiger-finch.trycloudflare.com" {
		t.Fatalf("expected tunnel URL to be parsed, got %q", url)
	}
	if got := quickTunnelURL.FindString("INF Requesting new quick Tunnel on trycloudflare.com..."); got != "" {
		t.Fatalf("expected no URL in progress line, got %q", got)
	}
}

func previewTestServer(t *testing.T, hooks Hooks) *Server {
	t.Helper()
	s := NewServer(4545, nil, nil, nil, nil, nil, nil, nil)
	s.SetHooks(hooks)
	return s
}

func TestHandleServers(t *testing.T) {
	s := previewTestServer(t, Hooks{
		Servers: func() []servers.Group {
			return []servers.Group{{
				ThreadID: "thread-1",
				Title:    "Shop site",
				Servers: []servers.Server{
					{PID: 100, Port: 5173, Name: "node", Kind: "node", OwnerThreadID: "thread-1"},
					{PID: 101, Port: 9999, Name: "agent-socket", Kind: "node", Agent: true},
					{PID: 102, Port: 0, Name: "idle", Kind: "node"},
				},
			}}
		},
	})

	req := httptest.NewRequest("GET", "/api/servers?token="+s.auth.Token(), nil)
	w := httptest.NewRecorder()
	s.requireAuth(s.handleServers)(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var groups []PreviewGroupView
	if err := json.NewDecoder(w.Body).Decode(&groups); err != nil {
		t.Fatalf("invalid response: %v", err)
	}
	if len(groups) != 1 || len(groups[0].Servers) != 1 {
		t.Fatalf("expected agent sockets and portless entries to be filtered, got %+v", groups)
	}
	if groups[0].Servers[0].Port != 5173 {
		t.Fatalf("expected port 5173, got %+v", groups[0].Servers[0])
	}

	reqAnon := httptest.NewRequest("GET", "/api/servers", nil)
	wAnon := httptest.NewRecorder()
	s.requireAuth(s.handleServers)(wAnon, reqAnon)
	if wAnon.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", wAnon.Code)
	}
}

func TestHandlePreviewStartValidation(t *testing.T) {
	s := previewTestServer(t, Hooks{})

	for _, body := range []string{`{}`, `{"port":0}`, `{"port":70000}`, `{"port":4545}`} {
		req := httptest.NewRequest("POST", "/api/preview/start?token="+s.auth.Token(), strings.NewReader(body))
		w := httptest.NewRecorder()
		s.requireAuth(s.handlePreviewStart)(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for %s, got %d: %s", body, w.Code, w.Body.String())
		}
	}

	// Nothing listens on this port in the test environment.
	req := httptest.NewRequest("POST", "/api/preview/start?token="+s.auth.Token(), strings.NewReader(`{"port":51999}`))
	w := httptest.NewRecorder()
	s.requireAuth(s.handlePreviewStart)(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for dead port, got %d: %s", w.Code, w.Body.String())
	}
}
