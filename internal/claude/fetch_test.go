package claude

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// Mirrors the live /api/oauth/usage body, trimmed to the windows the panel
// renders. The scoped window is what distinguishes it from the cached shape.
const livePayload = `{
  "five_hour": {"utilization": 0.0, "resets_at": "2026-08-30T20:00:00.05Z"},
  "limits": [
    {"kind":"session","group":"session","percent":38,"severity":"normal","resets_at":"2026-08-30T20:00:00.054444+00:00","scope":null,"is_active":true},
    {"kind":"weekly_all","group":"weekly","percent":61,"severity":"warning","resets_at":"2026-09-06T06:00:00.054465+00:00","scope":null,"is_active":false},
    {"kind":"weekly_scoped","group":"weekly","percent":72,"severity":"normal","resets_at":null,"scope":{"model":{"id":null,"display_name":"Opus"}},"is_active":false}
  ]
}`

func writeCredentials(t *testing.T, home string, expiresAt int64, refreshToken string) {
	t.Helper()
	contents := `{"mcpOAuth":{"linear":{"token":"keep-me"}},"claudeAiOauth":{"accessToken":"tok-abc","refreshToken":"` +
		refreshToken + `","expiresAt":` + strconv.FormatInt(expiresAt, 10) +
		`,"scopes":["user:inference"],"subscriptionType":"max"}}`
	writeCredentialsRaw(t, home, contents)
}

func writeCredentialsRaw(t *testing.T, home, contents string) {
	t.Helper()
	dir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".credentials.json"), []byte(contents), 0o600); err != nil {
		t.Fatalf("write credentials: %v", err)
	}
}

func serveUsage(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	server := httptest.NewServer(handler)
	previous := quotaEndpoint
	quotaEndpoint = server.URL
	t.Cleanup(func() {
		quotaEndpoint = previous
		server.Close()
	})
}

func TestFetchQuotaReadsLiveUtilization(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(time.Hour).UnixMilli(), "refresh-1")

	var gotAuth, gotBeta string
	serveUsage(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotBeta = r.Header.Get("anthropic-beta")
		_, _ = w.Write([]byte(livePayload))
	})

	before := time.Now().UnixMilli()
	limits, fetchedAt, err := FetchQuota(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("FetchQuota: %v", err)
	}
	if gotAuth != "Bearer tok-abc" {
		t.Errorf("Authorization = %q", gotAuth)
	}
	if gotBeta != oauthBeta {
		t.Errorf("anthropic-beta = %q, want %q", gotBeta, oauthBeta)
	}
	// The point of the live path: the reading is stamped now, not with whenever
	// another Claude client last refreshed the cache.
	if fetchedAt < before {
		t.Errorf("fetchedAt = %d, want >= %d", fetchedAt, before)
	}

	byWindow := map[string]int{}
	for _, limit := range limits {
		if limit.UsedPercent == nil {
			t.Fatalf("window %q has no percentage", limit.Window)
		}
		byWindow[limit.Window] = *limit.UsedPercent
	}
	if byWindow["five_hour"] != 38 {
		t.Errorf("five_hour = %d%%, want 38", byWindow["five_hour"])
	}
	if byWindow["seven_day"] != 61 {
		t.Errorf("seven_day = %d%%, want 61", byWindow["seven_day"])
	}
	if byWindow["seven_day_scoped:Opus"] != 72 {
		t.Errorf("scoped window missing or wrong: %+v", byWindow)
	}
}

func TestFetchQuotaWithoutCredentials(t *testing.T) {
	if _, _, err := FetchQuota(context.Background(), t.TempDir(), nil); !errors.Is(err, errNoCredentials) {
		t.Errorf("err = %v, want errNoCredentials", err)
	}
}

func TestFetchQuotaWithExpiredCredentials(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Minute).UnixMilli(), "")

	// Nothing to refresh with, so this must be reported as a sign-in the user has
	// to redo rather than spending a request that would only be refused.
	if _, _, err := FetchQuota(context.Background(), home, nil); !errors.Is(err, errCredentialsExpired) {
		t.Errorf("err = %v, want errCredentialsExpired", err)
	}
}

func TestFetchQuotaTreatsUnauthorizedAsExpired(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(time.Hour).UnixMilli(), "refresh-1")
	serveUsage(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})

	if _, _, err := FetchQuota(context.Background(), home, nil); !errors.Is(err, errCredentialsExpired) {
		t.Errorf("err = %v, want errCredentialsExpired", err)
	}
}

func TestQuotaSourceSeedsFromCLICacheBeforeAnyFetch(t *testing.T) {
	home := writeQuota(t, quotaFixture)

	limits, fetchedAt, _ := NewQuotaSource(home).Snapshot()
	if len(limits) != 2 {
		t.Fatalf("expected the cached windows, got %+v", limits)
	}
	if fetchedAt != 1786817326431 {
		t.Errorf("fetchedAt = %d, want the cache's own stamp", fetchedAt)
	}
}

func TestQuotaSourceKeepsCachedFiguresWhenFetchFails(t *testing.T) {
	home := writeQuota(t, quotaFixture)
	source := NewQuotaSource(home)
	source.Snapshot()

	deadline := time.Now().Add(2 * time.Second)
	for {
		limits, _, err := source.Snapshot()
		if err != nil {
			if len(limits) != 2 {
				t.Fatalf("a failed fetch blanked the cached figures: %+v", limits)
			}
			if !errors.Is(err, errNoCredentials) {
				t.Errorf("err = %v, want errNoCredentials", err)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("refresh never reported the missing credentials")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
