package remote

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthManager(t *testing.T) {
	auth := NewAuthManager()

	token := auth.Token()
	if len(token) < 32 {
		t.Fatalf("expected token of at least 32 characters, got %d", len(token))
	}

	pin := auth.PIN()
	if len(pin) != 6 {
		t.Fatalf("expected 6-digit PIN, got %q", pin)
	}

	if !auth.Validate(token) {
		t.Error("expected valid token to validate")
	}
	if !auth.Validate(pin) {
		t.Error("expected valid PIN to validate")
	}
	if auth.Validate("wrong-token") {
		t.Error("expected invalid token to fail")
	}

	// Test request authentication
	req := httptest.NewRequest("GET", "/?token="+token, nil)
	if !auth.AuthenticateRequest(req) {
		t.Error("expected query token to authenticate")
	}

	reqHeader := httptest.NewRequest("GET", "/", nil)
	reqHeader.Header.Set("Authorization", "Bearer "+token)
	if !auth.AuthenticateRequest(reqHeader) {
		t.Error("expected bearer token to authenticate")
	}

	reqCookie := httptest.NewRequest("GET", "/", nil)
	reqCookie.AddCookie(&http.Cookie{Name: CookieName, Value: token})
	if !auth.AuthenticateRequest(reqCookie) {
		t.Error("expected cookie to authenticate")
	}

	reqBad := httptest.NewRequest("GET", "/", nil)
	if auth.AuthenticateRequest(reqBad) {
		t.Error("expected empty request to fail authentication")
	}
}

func TestGenerateQRCode(t *testing.T) {
	dataURI, err := GenerateQRCodePNG("https://example.com/?token=123")
	if err != nil {
		t.Fatalf("failed to generate QR code: %v", err)
	}
	if !strings.HasPrefix(dataURI, "data:image/png;base64,") {
		t.Fatalf("expected base64 PNG data URI, got prefix: %s", dataURI[:30])
	}
}

func TestTunnelManager(t *testing.T) {
	tm := NewTunnelManager(4545)
	tm.publicURL = "https://test-tunnel.trycloudflare.com"
	public, best, _, _, _ := tm.Status("secret")

	if !strings.Contains(public, "token=secret") {
		t.Errorf("expected token in public url, got %s", public)
	}
	if best == "" {
		t.Errorf("expected best url to be populated")
	}
}

func TestRemoteHTTPHandlers(t *testing.T) {
	auth := NewAuthManager()
	token := auth.Token()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		if !auth.AuthenticateRequest(r) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Unauthorized call
	req := httptest.NewRequest("GET", "/api/status", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
	}

	// Authorized call
	reqAuth := httptest.NewRequest("GET", "/api/status?token="+token, nil)
	wAuth := httptest.NewRecorder()
	mux.ServeHTTP(wAuth, reqAuth)
	if wAuth.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wAuth.Code)
	}
}
