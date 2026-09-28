package cliupdate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ClaudePackage is the npm release the update check tracks for Claude Code.
const ClaudePackage = "@anthropic-ai/claude-code"

// checkTTL bounds how often any caller can hit the npm registry. Provider
// probes run far more often than releases ship, so without this every model
// refresh would cost a network round trip.
const checkTTL = 6 * time.Hour

const lookupTimeout = 15 * time.Second

// Advisory tells the UI whether the installed CLI lags its published release.
// It rides the provider snapshot, the way T3 surfaces provider update
// advisories, so every surface that lists providers can offer the update.
type Advisory struct {
	Installed string `json:"installed"`
	Latest    string `json:"latest"`
	Available bool   `json:"available"`
	CheckedAt int64  `json:"checkedAt"`
}

var (
	mu     sync.Mutex
	cached = make(map[string]cachedCheck)
)

type cachedCheck struct {
	latest string
	at     time.Time
}

// Check reports whether installed lags the published npm release. Failures
// and empty input yield a zero advisory rather than an error: an offline PC
// must never surface as an update prompt.
func Check(ctx context.Context, npmPackage, installed string) Advisory {
	installed = strings.TrimSpace(installed)
	if npmPackage == "" || installed == "" {
		return Advisory{}
	}

	latest, ok := cachedLatest(ctx, npmPackage)
	if !ok {
		return Advisory{Installed: installed}
	}
	return Advisory{
		Installed: installed,
		Latest:    latest,
		Available: Compare(installed, latest) < 0,
		CheckedAt: time.Now().UnixMilli(),
	}
}

// Forget drops the cached lookup so the next check goes back to the network,
// used after an update runs.
func Forget(npmPackage string) {
	mu.Lock()
	delete(cached, npmPackage)
	mu.Unlock()
}

func cachedLatest(ctx context.Context, npmPackage string) (string, bool) {
	mu.Lock()
	entry, ok := cached[npmPackage]
	mu.Unlock()
	if ok && time.Since(entry.at) < checkTTL && entry.latest != "" {
		return entry.latest, true
	}

	latest, err := Latest(ctx, npmPackage)
	if err != nil || latest == "" {
		return "", false
	}
	mu.Lock()
	cached[npmPackage] = cachedCheck{latest: latest, at: time.Now()}
	mu.Unlock()
	return latest, true
}

// Latest resolves the published version through the npm registry metadata,
// which is a small unauthenticated document.
func Latest(ctx context.Context, npmPackage string) (string, error) {
	return latestFrom(ctx, "https://registry.npmjs.org/"+npmPackage+"/latest")
}

func latestFrom(ctx context.Context, url string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, lookupTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("npm registry answered %d", resp.StatusCode)
	}
	var body struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if strings.TrimSpace(body.Version) == "" {
		return "", fmt.Errorf("npm registry answered without a version")
	}
	return strings.TrimSpace(body.Version), nil
}

// Compare orders two version strings numerically per segment, ignoring any
// prerelease or build suffix the same way the model catalog does.
func Compare(a, b string) int {
	aParts, bParts := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(aParts) || i < len(bParts); i++ {
		av, bv := part(aParts, i), part(bParts, i)
		if av != bv {
			if av < bv {
				return -1
			}
			return 1
		}
	}
	return 0
}

func part(parts []string, index int) int {
	if index >= len(parts) {
		return 0
	}
	digits := parts[index]
	for i, r := range digits {
		if r < '0' || r > '9' {
			digits = digits[:i]
			break
		}
	}
	value, _ := strconv.Atoi(digits)
	return value
}
