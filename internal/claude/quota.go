package claude

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"composer/internal/domain"
)

// quotaFile is the CLI's own config, which caches the same utilisation figures
// its /usage view renders. Reading it costs nothing and needs no agent turn,
// unlike the rate_limit_event frames that only arrive mid-request.
const quotaFile = ".claude.json"

var quotaEndpoint = "https://api.anthropic.com/api/oauth/usage"

const oauthBeta = "oauth-2025-04-20"

type limitEntry struct {
	Kind     string `json:"kind"`
	Group    string `json:"group"`
	Percent  *int   `json:"percent"`
	Severity string `json:"severity"`
	ResetsAt string `json:"resets_at"`
	IsActive bool   `json:"is_active"`
	Scope    *struct {
		Model *struct {
			DisplayName string `json:"display_name"`
		} `json:"model"`
	} `json:"scope"`
}

type utilizationPayload struct {
	Limits []limitEntry `json:"limits"`
}

type cachedUsage struct {
	FetchedAtMs int64              `json:"fetchedAtMs"`
	Utilization utilizationPayload `json:"utilization"`
}

type quotaConfig struct {
	CachedUsageUtilization *cachedUsage `json:"cachedUsageUtilization"`
}

// windowNames maps the CLI's limit kinds onto the labels it shows users.
var windowNames = map[string]string{
	"session":       "five_hour",
	"weekly_all":    "seven_day",
	"weekly_opus":   "seven_day_opus",
	"weekly_sonnet": "seven_day_sonnet",
}

func resolveHome(home string) (string, error) {
	if home != "" {
		return home, nil
	}
	return os.UserHomeDir()
}

func windowFor(entry limitEntry) string {
	if entry.Kind == "weekly_scoped" {
		if entry.Scope != nil && entry.Scope.Model != nil && entry.Scope.Model.DisplayName != "" {
			return "seven_day_scoped:" + entry.Scope.Model.DisplayName
		}
		return "seven_day_scoped"
	}
	if named := windowNames[entry.Kind]; named != "" {
		return named
	}
	return entry.Kind
}

func limitsFrom(payload utilizationPayload) []domain.RateLimit {
	limits := make([]domain.RateLimit, 0, len(payload.Limits))
	for _, entry := range payload.Limits {
		if entry.Percent == nil {
			continue
		}

		limit := domain.RateLimit{
			Window:      windowFor(entry),
			Status:      entry.Severity,
			UsedPercent: entry.Percent,
		}
		if entry.ResetsAt != "" {
			if parsed, err := time.Parse(time.RFC3339, entry.ResetsAt); err == nil {
				limit.ResetsAt = parsed.Unix()
			}
		}
		limits = append(limits, limit)
	}
	return limits
}

// FetchQuota asks Anthropic for the account's current utilisation, using the
// OAuth token Claude Code stores after sign-in and renewing it when it has
// expired.
//
// This is the same call the CLI makes to fill the cache ReadQuota falls back
// to, so the figures are current at the moment of the call rather than as of
// whenever another Claude client last happened to look.
func FetchQuota(ctx context.Context, home string, client *http.Client) ([]domain.RateLimit, int64, error) {
	home, err := resolveHome(home)
	if err != nil {
		return nil, 0, err
	}

	credentials, err := usableCredentials(ctx, home, client)
	if err != nil {
		return nil, 0, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, quotaEndpoint, nil)
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Authorization", "Bearer "+credentials.AccessToken)
	request.Header.Set("anthropic-beta", oauthBeta)
	request.Header.Set("Accept", "application/json")

	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()

	switch {
	case response.StatusCode == http.StatusUnauthorized, response.StatusCode == http.StatusForbidden:
		return nil, 0, errCredentialsExpired
	case response.StatusCode != http.StatusOK:
		return nil, 0, fmt.Errorf("usage request failed: %s", strings.TrimSpace(response.Status))
	}

	var payload utilizationPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, 0, err
	}

	limits := limitsFrom(payload)
	if len(limits) == 0 {
		return nil, 0, errors.New("usage response reported no windows")
	}
	return limits, time.Now().UnixMilli(), nil
}

// ReadQuota returns subscription utilisation from the Claude CLI's cache.
//
// The cache is refreshed by the CLI itself whenever it talks to the API, so the
// figures can lag; FetchedAt is returned so a caller can show staleness rather
// than presenting an old number as current.
func ReadQuota(home string) ([]domain.RateLimit, int64, error) {
	home, err := resolveHome(home)
	if err != nil {
		return nil, 0, err
	}

	raw, err := os.ReadFile(filepath.Join(home, quotaFile))
	if err != nil {
		return nil, 0, err
	}

	var config quotaConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return nil, 0, err
	}
	if config.CachedUsageUtilization == nil {
		return nil, 0, nil
	}

	cache := config.CachedUsageUtilization
	return limitsFrom(cache.Utilization), cache.FetchedAtMs, nil
}
