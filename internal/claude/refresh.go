package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var tokenEndpoint = "https://api.anthropic.com/v1/oauth/token"

// oauthClientID is Claude Code's own public OAuth client. The refresh token
// stored on this machine was issued to it and is accepted for no other.
const oauthClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

const lockFile = ".claude/.credentials.composer.lock"

// lockStaleAfter bounds how long a lock left behind by a killed process can
// block a refresh.
const lockStaleAfter = 30 * time.Second

const lockPollInterval = 25 * time.Millisecond

var lockWait = 5 * time.Second

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type tokenError struct {
	Error       string `json:"error"`
	Description string `json:"error_description"`
}

// renewed holds tokens this process obtained, keyed by home directory.
//
// It matters only when writing them back failed: without it the stored copy
// still looks expired on the next poll, and each poll would spend another
// rotation, invalidating the CLI's token every time round.
var renewed = struct {
	sync.Mutex
	byHome map[string]*oauthCredentials
}{byHome: map[string]*oauthCredentials{}}

func recallRenewed(home string) *oauthCredentials {
	renewed.Lock()
	defer renewed.Unlock()

	credentials := renewed.byHome[home]
	if credentials == nil || expiringSoon(credentials) {
		return nil
	}
	return credentials
}

func rememberRenewed(home string, credentials *oauthCredentials) {
	renewed.Lock()
	defer renewed.Unlock()
	renewed.byHome[home] = credentials
}

// usableCredentials returns credentials good for a request right now, renewing
// them through the refresh grant when the stored access token has run out.
func usableCredentials(ctx context.Context, home string, client *http.Client) (*oauthCredentials, error) {
	credentials, err := loadCredentials(home)
	if err != nil {
		return nil, err
	}
	if !expiringSoon(credentials) {
		return credentials, nil
	}
	if remembered := recallRenewed(home); remembered != nil {
		return remembered, nil
	}

	fresh, err := renewCredentials(ctx, home, client, credentials)
	if err != nil {
		return nil, err
	}
	rememberRenewed(home, fresh)
	return fresh, nil
}

// renewCredentials exchanges the refresh token and writes the result back.
//
// The credential store is shared with the Claude CLI, which refreshes on its own
// schedule, and the grant rotates the refresh token: whoever exchanges last
// invalidates the other's copy. Two things keep that from signing the user out.
// A lock file serialises Composer against itself, and the store is re-read once
// the lock is held, so a token another client renewed while this call waited is
// adopted instead of a second exchange being spent on it.
func renewCredentials(ctx context.Context, home string, client *http.Client, stale *oauthCredentials) (*oauthCredentials, error) {
	unlock, err := lockCredentials(home)
	if err != nil {
		return nil, err
	}
	defer unlock()

	current := stale
	if latest, err := loadCredentials(home); err == nil {
		if !expiringSoon(latest) {
			return latest, nil
		}
		current = latest
	}

	if !refreshTokenUsable(current) {
		return nil, errCredentialsExpired
	}

	token, err := exchangeRefreshToken(ctx, client, current.RefreshToken)
	if err != nil {
		return nil, err
	}

	next := *current
	next.AccessToken = token.AccessToken
	if token.RefreshToken != "" {
		next.RefreshToken = token.RefreshToken
	}
	if token.ExpiresIn > 0 {
		next.ExpiresAt = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second).UnixMilli()
	}

	// A failed write is not fatal. The exchange already happened, so discarding
	// the result here would strand the rotated token and leave nothing able to
	// authenticate; the caller holds it in memory instead.
	_ = storeCredentials(home, &next)
	return &next, nil
}

func exchangeRefreshToken(ctx context.Context, client *http.Client, refreshToken string) (*tokenResponse, error) {
	body, err := json.Marshal(map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
		"client_id":     oauthClientID,
	})
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, refreshFailure(response)
	}

	var token tokenResponse
	if err := json.NewDecoder(response.Body).Decode(&token); err != nil {
		return nil, err
	}
	if token.AccessToken == "" {
		return nil, errors.New("refresh returned no access token")
	}
	return &token, nil
}

// refreshFailure separates a refused grant from a server that is merely
// unavailable: only the first means the user has to sign in again.
func refreshFailure(response *http.Response) error {
	var failure tokenError
	_ = json.NewDecoder(response.Body).Decode(&failure)

	switch failure.Error {
	case "invalid_grant", "invalid_client", "unauthorized_client":
		return errCredentialsExpired
	}
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return errCredentialsExpired
	}
	if failure.Description != "" {
		return fmt.Errorf("token refresh failed: %s", failure.Description)
	}
	return fmt.Errorf("token refresh failed: %s", strings.TrimSpace(response.Status))
}

func lockCredentials(home string) (func(), error) {
	path := filepath.Join(home, filepath.FromSlash(lockFile))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}

	deadline := time.Now().Add(lockWait)
	for {
		handle, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			handle.Close()
			return func() { os.Remove(path) }, nil
		}
		if !os.IsExist(err) {
			return nil, err
		}
		if info, statErr := os.Stat(path); statErr == nil && time.Since(info.ModTime()) > lockStaleAfter {
			os.Remove(path)
			continue
		}
		if time.Now().After(deadline) {
			return nil, errors.New("another refresh is already in progress")
		}
		time.Sleep(lockPollInterval)
	}
}
