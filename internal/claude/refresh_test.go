package claude

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func serveToken(t *testing.T, handler http.HandlerFunc) *int {
	t.Helper()
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		handler(w, r)
	}))
	previous := tokenEndpoint
	tokenEndpoint = server.URL
	t.Cleanup(func() {
		tokenEndpoint = previous
		server.Close()
	})
	return &calls
}

func refuseToken(t *testing.T) *int {
	t.Helper()
	return serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("the refresh grant was spent when it should not have been")
		w.WriteHeader(http.StatusInternalServerError)
	})
}

func storedCredentials(t *testing.T, home string) *oauthCredentials {
	t.Helper()
	credentials, err := loadCredentials(home)
	if err != nil {
		t.Fatalf("loadCredentials: %v", err)
	}
	return credentials
}

func TestFetchQuotaRenewsExpiredToken(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-old")

	var grant map[string]string
	calls := serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&grant); err != nil {
			t.Errorf("decode grant: %v", err)
		}
		_, _ = w.Write([]byte(`{"access_token":"tok-new","refresh_token":"refresh-new","expires_in":28800}`))
	})

	var usedToken string
	serveUsage(t, func(w http.ResponseWriter, r *http.Request) {
		usedToken = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(livePayload))
	})

	if _, _, err := FetchQuota(context.Background(), home, nil); err != nil {
		t.Fatalf("FetchQuota: %v", err)
	}

	if *calls != 1 {
		t.Errorf("refresh calls = %d, want 1", *calls)
	}
	if grant["grant_type"] != "refresh_token" || grant["refresh_token"] != "refresh-old" {
		t.Errorf("grant body = %+v", grant)
	}
	if grant["client_id"] != oauthClientID {
		t.Errorf("client_id = %q, want Claude Code's", grant["client_id"])
	}
	// The renewed token has to reach the usage request; sending the expired one
	// would make the refresh pointless.
	if usedToken != "Bearer tok-new" {
		t.Errorf("usage Authorization = %q, want the renewed token", usedToken)
	}

	saved := storedCredentials(t, home)
	if saved.AccessToken != "tok-new" {
		t.Errorf("stored accessToken = %q", saved.AccessToken)
	}
	// The grant rotates the refresh token: not persisting the replacement leaves
	// the CLI holding one the server has already invalidated.
	if saved.RefreshToken != "refresh-new" {
		t.Errorf("stored refreshToken = %q, want the rotated one", saved.RefreshToken)
	}
	if saved.ExpiresAt <= time.Now().UnixMilli() {
		t.Errorf("stored expiresAt = %d, want a future deadline", saved.ExpiresAt)
	}
}

func TestRefreshPreservesTheRestOfTheCredentialStore(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-old")
	serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok-new","refresh_token":"refresh-new","expires_in":28800}`))
	})

	if _, err := usableCredentials(context.Background(), home, nil); err != nil {
		t.Fatalf("usableCredentials: %v", err)
	}

	raw, err := os.ReadFile(credentialsFile(home))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	// The file belongs to the CLI and holds unrelated state; rewriting only the
	// tokens is what keeps MCP sign-ins alive.
	if string(envelope["mcpOAuth"]) != `{"linear":{"token":"keep-me"}}` {
		t.Errorf("mcpOAuth = %s, want it carried through untouched", envelope["mcpOAuth"])
	}

	var section map[string]any
	if err := json.Unmarshal(envelope[credentialsKey], &section); err != nil {
		t.Fatalf("unmarshal section: %v", err)
	}
	if section["subscriptionType"] != "max" {
		t.Errorf("subscriptionType = %v, want it preserved", section["subscriptionType"])
	}
	if scopes, ok := section["scopes"].([]any); !ok || len(scopes) != 1 {
		t.Errorf("scopes = %v, want them preserved", section["scopes"])
	}
}

func TestRefreshAdoptsATokenAnotherClientAlreadyRenewed(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(time.Hour).UnixMilli(), "refresh-new")
	calls := refuseToken(t)

	// What Composer read before waiting on the lock, by which point the CLI has
	// written a fresh token of its own.
	stale := &oauthCredentials{AccessToken: "tok-old", RefreshToken: "refresh-old", ExpiresAt: 1}

	renewed, err := renewCredentials(context.Background(), home, nil, stale)
	if err != nil {
		t.Fatalf("renewCredentials: %v", err)
	}
	if renewed.AccessToken != "tok-abc" {
		t.Errorf("accessToken = %q, want the one already on disk", renewed.AccessToken)
	}
	if *calls != 0 {
		t.Errorf("refresh calls = %d, want none", *calls)
	}
}

func TestRefreshRefusedGrantAsksForSignIn(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-dead")
	serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant","error_description":"Refresh token not found or invalid"}`))
	})

	if _, err := usableCredentials(context.Background(), home, nil); !errors.Is(err, errCredentialsExpired) {
		t.Fatalf("err = %v, want errCredentialsExpired", err)
	}
	// A refused grant must not disturb what is stored: the CLI may still be able
	// to recover the session itself.
	if saved := storedCredentials(t, home); saved.AccessToken != "tok-abc" || saved.RefreshToken != "refresh-dead" {
		t.Errorf("credentials were rewritten after a refusal: %+v", saved)
	}
}

func TestRefreshOutageIsNotReportedAsSignedOut(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-old")
	serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})

	_, err := usableCredentials(context.Background(), home, nil)
	if err == nil {
		t.Fatal("expected an error")
	}
	// Telling the user to sign in again because Anthropic had a bad minute would
	// send them to fix something that is not broken.
	if errors.Is(err, errCredentialsExpired) {
		t.Errorf("err = %v, want a transient failure", err)
	}
}

func TestValidTokenIsNeverRefreshed(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(time.Hour).UnixMilli(), "refresh-old")
	calls := refuseToken(t)

	credentials, err := usableCredentials(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("usableCredentials: %v", err)
	}
	if credentials.AccessToken != "tok-abc" {
		t.Errorf("accessToken = %q", credentials.AccessToken)
	}
	if *calls != 0 {
		t.Errorf("refresh calls = %d, want none", *calls)
	}
}

func TestTokenAboutToExpireIsRefreshedEarly(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(10*time.Second).UnixMilli(), "refresh-old")
	calls := serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok-new","expires_in":28800}`))
	})

	credentials, err := usableCredentials(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("usableCredentials: %v", err)
	}
	// Renewing only once the deadline has passed would let a token lapse between
	// the check and the request it authorises.
	if credentials.AccessToken != "tok-new" || *calls != 1 {
		t.Errorf("accessToken = %q after %d refreshes", credentials.AccessToken, *calls)
	}
	// The response carried no replacement, so the existing one stays usable.
	if saved := storedCredentials(t, home); saved.RefreshToken != "refresh-old" {
		t.Errorf("stored refreshToken = %q, want it kept", saved.RefreshToken)
	}
}

func TestRenewalIsNotSpentTwiceWhenTheStoreLosesIt(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-old")
	original, err := os.ReadFile(credentialsFile(home))
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	calls := serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok-new","refresh_token":"refresh-new","expires_in":28800}`))
	})

	first, err := usableCredentials(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("first: %v", err)
	}

	// The CLI writing its own copy back puts the expired token on disk again.
	// Reaching for the grant a second time would rotate away the token the CLI
	// is holding, and every poll after it would do the same.
	if err := os.WriteFile(credentialsFile(home), original, 0o600); err != nil {
		t.Fatalf("restore: %v", err)
	}

	second, err := usableCredentials(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if *calls != 1 {
		t.Errorf("refresh calls = %d, want 1", *calls)
	}
	if second.AccessToken != first.AccessToken {
		t.Errorf("accessToken = %q, want the one already obtained", second.AccessToken)
	}
}

func TestRefreshLeavesNoTemporaryFileBehind(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-old")
	serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok-new","refresh_token":"refresh-new","expires_in":28800}`))
	})

	if _, err := usableCredentials(context.Background(), home, nil); err != nil {
		t.Fatalf("usableCredentials: %v", err)
	}

	entries, err := os.ReadDir(filepath.Join(home, ".claude"))
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	for _, entry := range entries {
		if entry.Name() != ".credentials.json" {
			t.Errorf("stray file left in the credential directory: %s", entry.Name())
		}
	}
}

func TestLockIsReleasedSoLaterRefreshesProceed(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-1")
	round := 0
	serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		round++
		w.Write([]byte(`{"access_token":"tok-` + string(rune('0'+round)) + `","expires_in":-1}`))
	})

	for attempt := 1; attempt <= 2; attempt++ {
		if _, err := usableCredentials(context.Background(), home, nil); err != nil {
			t.Fatalf("attempt %d: %v", attempt, err)
		}
	}
	if round != 2 {
		t.Errorf("refresh calls = %d, want 2", round)
	}
}

func TestStaleLockDoesNotBlockRefreshForever(t *testing.T) {
	home := t.TempDir()
	writeCredentials(t, home, time.Now().Add(-time.Hour).UnixMilli(), "refresh-old")

	path := filepath.Join(home, filepath.FromSlash(lockFile))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatalf("write lock: %v", err)
	}
	abandoned := time.Now().Add(-lockStaleAfter - time.Minute)
	if err := os.Chtimes(path, abandoned, abandoned); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	serveToken(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"tok-new","expires_in":28800}`))
	})

	// A lock left by a killed process must expire, or quota stays broken until
	// someone deletes a file they have no reason to know about.
	credentials, err := usableCredentials(context.Background(), home, nil)
	if err != nil {
		t.Fatalf("usableCredentials: %v", err)
	}
	if credentials.AccessToken != "tok-new" {
		t.Errorf("accessToken = %q", credentials.AccessToken)
	}
}

func TestHeldLockTurnsAwayASecondRefresh(t *testing.T) {
	home := t.TempDir()
	previous := lockWait
	lockWait = 50 * time.Millisecond
	t.Cleanup(func() { lockWait = previous })

	unlock, err := lockCredentials(home)
	if err != nil {
		t.Fatalf("lockCredentials: %v", err)
	}
	defer unlock()

	if _, err := lockCredentials(home); err == nil {
		t.Error("expected the second lock attempt to be refused")
	}
}
