package remote

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestMux(s *Server) *http.ServeMux {
	mux := http.NewServeMux()
	s.registerRoutes(mux)
	return mux
}

func TestLocalControlNeedsSecret(t *testing.T) {
	s := NewServer(0, nil, nil, nil, nil, nil, nil, nil)
	stopped := false
	mux := newTestMux(s)

	call := func(method, path, secret string) int {
		req := httptest.NewRequest(method, path, strings.NewReader("{}"))
		req.RemoteAddr = "127.0.0.1:5555"
		if secret != "" {
			req.Header.Set(LocalControlHeader, secret)
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec.Code
	}

	// Without local control installed (the desktop app) the endpoints do not exist.
	if code := call(http.MethodPost, "/api/local/shutdown", "anything"); code != http.StatusNotFound {
		t.Fatalf("no control: got %d", code)
	}

	s.SetLocalControl(&LocalControl{Secret: "s3cret", Stop: func() { stopped = true }})
	if code := call(http.MethodPost, "/api/local/shutdown", "wrong"); code != http.StatusNotFound || stopped {
		t.Fatalf("wrong secret: got %d stopped=%v", code, stopped)
	}
	if code := call(http.MethodGet, "/api/local/instance", "s3cret"); code != http.StatusOK {
		t.Fatalf("instance: got %d", code)
	}
	if code := call(http.MethodPost, "/api/local/shutdown", "s3cret"); code != http.StatusAccepted || !stopped {
		t.Fatalf("shutdown: got %d stopped=%v", code, stopped)
	}
}

func TestLocalControlRefusesRemoteAddresses(t *testing.T) {
	s := NewServer(0, nil, nil, nil, nil, nil, nil, nil)
	s.SetLocalControl(&LocalControl{Secret: "s3cret", Stop: func() { t.Fatal("stopped from a remote address") }})
	req := httptest.NewRequest(http.MethodPost, "/api/local/shutdown", nil)
	req.RemoteAddr = "100.64.1.2:4000"
	req.Header.Set(LocalControlHeader, "s3cret")
	rec := httptest.NewRecorder()
	newTestMux(s).ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestSystemShutdownOnlyWhenHeadless(t *testing.T) {
	s := NewServer(0, nil, nil, nil, nil, nil, nil, nil)
	token := s.auth.Token()
	post := func(body string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/system/shutdown", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		newTestMux(s).ServeHTTP(rec, req)
		return rec.Code
	}
	if code := post(`{"confirm":"shutdown"}`); code != http.StatusNotFound {
		t.Fatalf("desktop mode: got %d", code)
	}

	calls := 0
	s.SetHooks(Hooks{PowerOff: func() error { calls++; return nil }})
	if code := post(`{}`); code != http.StatusBadRequest || calls != 0 {
		t.Fatalf("unconfirmed: got %d calls=%d", code, calls)
	}
	if code := post(`{"confirm":"shutdown"}`); code != http.StatusOK || calls != 1 {
		t.Fatalf("confirmed: got %d calls=%d", code, calls)
	}
}
