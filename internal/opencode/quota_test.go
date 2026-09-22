package opencode

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestGoKeyFromContent(t *testing.T) {
	key := goKeyFromContent(`{"opencode-go": {"type": "api", "key": "sk-test"}, "openai": {"type": "oauth"}}`)
	if key != "sk-test" {
		t.Fatalf("key = %q, want sk-test", key)
	}
	if got := goKeyFromContent(`{"opencode": {"type": "api", "key": "sk-zen"}}`); got != "" {
		t.Fatalf("zen key must not satisfy the Go lookup, got %q", got)
	}
	if got := goKeyFromContent(`{"opencode-go": {"type": "api"}}`); got != "" {
		t.Fatalf("entry without key must not satisfy the lookup, got %q", got)
	}
	if got := goKeyFromContent(`not json`); got != "" {
		t.Fatalf("malformed content must yield no key, got %q", got)
	}
}

func TestGoAPIKeyPrefersEnv(t *testing.T) {
	t.Setenv("OPENCODE_GO_API_KEY", "sk-env")
	t.Setenv("OPENCODE_AUTH_CONTENT", `{"opencode-go": {"type": "api", "key": "sk-content"}}`)
	key, err := goAPIKey()
	if err != nil || key != "sk-env" {
		t.Fatalf("key = %q, err = %v, want sk-env", key, err)
	}
}

func TestFetchGoQuotaMapsWindows(t *testing.T) {
	t.Setenv("OPENCODE_GO_API_KEY", "sk-test")
	t.Setenv("OPENCODE_AUTH_CONTENT", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"usage": map[string]any{
				"rolling": map[string]any{"status": "ok", "percent": 9, "resetsAt": time.Now().Add(5 * time.Hour).Format(time.RFC3339)},
				"weekly":  map[string]any{"status": "ok", "percent": 12, "resetsAt": time.Now().Add(72 * time.Hour).Format(time.RFC3339)},
				"monthly": map[string]any{"status": "ok", "percent": 6, "resetsAt": time.Now().Add(720 * time.Hour).Format(time.RFC3339)},
			},
		})
	}))
	defer server.Close()

	old := goUsageEndpoint
	goUsageEndpoint = server.URL
	defer func() { goUsageEndpoint = old }()

	limits, _, err := FetchGoQuota(context.Background(), server.Client())
	if err != nil {
		t.Fatalf("FetchGoQuota: %v", err)
	}
	byWindow := map[string]int{}
	for _, l := range limits {
		if l.UsedPercent != nil {
			byWindow[l.Window] = *l.UsedPercent
		}
		if l.ResetsAt == 0 {
			t.Errorf("window %q missing reset time", l.Window)
		}
	}
	if byWindow["five_hour"] != 9 || byWindow["seven_day"] != 12 || byWindow["monthly"] != 6 {
		t.Fatalf("windows = %+v, want five_hour:9 seven_day:12 monthly:6", byWindow)
	}
}

func TestFetchGoQuotaRejectsKey(t *testing.T) {
	t.Setenv("OPENCODE_GO_API_KEY", "sk-bad")
	t.Setenv("OPENCODE_AUTH_CONTENT", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	old := goUsageEndpoint
	goUsageEndpoint = server.URL
	defer func() { goUsageEndpoint = old }()

	if _, _, err := FetchGoQuota(context.Background(), server.Client()); err == nil {
		t.Fatal("expected error for rejected key")
	}
}
