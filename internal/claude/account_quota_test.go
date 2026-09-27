package claude

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestAccountQuotaReadsTheAccountFolder(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(time.Hour).UnixMilli(), "refresh-home")
	account := t.TempDir()

	if _, _, err := FetchAccountQuota(context.Background(), account, nil); !errors.Is(err, errNoCredentials) {
		t.Fatalf("an empty account folder must report signed out, got %v", err)
	}

	expires := strconv.FormatInt(time.Now().Add(time.Hour).UnixMilli(), 10)
	stored := `{"claudeAiOauth":{"accessToken":"tok-account","refreshToken":"r","expiresAt":` + expires + `}}`
	if err := os.WriteFile(filepath.Join(account, ".credentials.json"), []byte(stored), 0o600); err != nil {
		t.Fatal(err)
	}
	var seen string
	serveUsage(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(livePayload))
	})
	if _, _, err := FetchAccountQuota(context.Background(), account, nil); err != nil {
		t.Fatalf("FetchAccountQuota: %v", err)
	}
	if seen != "Bearer tok-account" {
		t.Fatalf("the account's own token must be used, got %q", seen)
	}

	cache := `{"cachedUsageUtilization":{"fetchedAtMs":42,"utilization":{"limits":[{"kind":"session","percent":7}]}}}`
	if err := os.WriteFile(filepath.Join(account, quotaFile), []byte(cache), 0o600); err != nil {
		t.Fatal(err)
	}
	limits, fetchedAt, err := ReadAccountQuota(account)
	if err != nil || fetchedAt != 42 || len(limits) != 1 {
		t.Fatalf("ReadAccountQuota = %+v, %d, %v", limits, fetchedAt, err)
	}
}
