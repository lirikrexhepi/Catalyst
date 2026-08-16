package claude

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"catalyst/internal/domain"
)

// quotaFile is the CLI's own config, which caches the same utilisation figures
// its /usage view renders. Reading it costs nothing and needs no agent turn,
// unlike the rate_limit_event frames that only arrive mid-request.
const quotaFile = ".claude.json"

type cachedUsage struct {
	FetchedAtMs int64 `json:"fetchedAtMs"`
	Utilization struct {
		Limits []struct {
			Kind     string `json:"kind"`
			Group    string `json:"group"`
			Percent  *int   `json:"percent"`
			Severity string `json:"severity"`
			ResetsAt string `json:"resets_at"`
			IsActive bool   `json:"is_active"`
		} `json:"limits"`
	} `json:"utilization"`
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

// ReadQuota returns subscription utilisation from the Claude CLI's cache.
//
// The cache is refreshed by the CLI itself whenever it talks to the API, so the
// figures can lag; FetchedAt is returned so a caller can show staleness rather
// than presenting an old number as current.
func ReadQuota(home string) ([]domain.RateLimit, int64, error) {
	if home == "" {
		resolved, err := os.UserHomeDir()
		if err != nil {
			return nil, 0, err
		}
		home = resolved
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
	limits := make([]domain.RateLimit, 0, len(cache.Utilization.Limits))
	for _, entry := range cache.Utilization.Limits {
		if entry.Percent == nil {
			continue
		}
		window := windowNames[entry.Kind]
		if window == "" {
			window = entry.Kind
		}

		limit := domain.RateLimit{
			Window:      window,
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

	return limits, cache.FetchedAtMs, nil
}
