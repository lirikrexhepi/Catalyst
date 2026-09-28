package main

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	"composer/internal/cliupdate"
	"composer/internal/domain"
	"composer/internal/provider"
	"composer/internal/shell"
)

const updateTimeout = 5 * time.Minute

// ClaudeUpdateStatus forces a fresh look at the published Claude Code release.
// A failed lookup is an error rather than a stale answer, so the UI can say
// it could not check instead of claiming everything is current.
func (a *App) ClaudeUpdateStatus() (domain.ProviderUpdate, error) {
	cliupdate.Forget(cliupdate.ClaudePackage)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	snapshot := provider.ProbeVersion(ctx, "claude", domain.ProviderSettings{})
	if snapshot.Availability != domain.AvailabilityReady || snapshot.Version == "" {
		return domain.ProviderUpdate{}, fmt.Errorf("claude CLI is not available")
	}
	advisory := cliupdate.Check(ctx, cliupdate.ClaudePackage, snapshot.Version)
	if advisory.Latest == "" {
		return domain.ProviderUpdate{}, fmt.Errorf("could not reach the update feed")
	}
	return domain.ProviderUpdate{
		Installed: advisory.Installed,
		Latest:    advisory.Latest,
		Available: advisory.Available,
		CheckedAt: advisory.CheckedAt,
	}, nil
}

// UpdateClaudeCode runs `claude update` the way T3 runs provider updates:
// explicit and user-initiated, never silent, with the provider list
// re-probed afterwards so the new version shows up immediately.
func (a *App) UpdateClaudeCode() (string, error) {
	env := shell.BaseEnvironment()
	if _, found := shell.LookPath("claude", env); !found {
		return "", fmt.Errorf("claude was not found on PATH")
	}

	ctx, cancel := context.WithTimeout(context.Background(), updateTimeout)
	defer cancel()

	resolved := shell.SpawnCommand("claude", []string{"update"}, env)
	cmd := updateExec(ctx, resolved.Command, resolved.Args...)
	cmd.Env = shell.Slice(env)

	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	if err := cmd.Run(); err != nil {
		return tailLines(output.String(), 6), fmt.Errorf("claude update failed: %w", err)
	}

	cliupdate.Forget(cliupdate.ClaudePackage)
	probeCtx, probeCancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer probeCancel()
	a.registry.Probe(probeCtx, true)

	return tailLines(output.String(), 6), nil
}

// watchClaudeUpdates checks for a newer Claude Code release after startup
// settles and every few hours after. When one is found the window gets an
// event and offers the update; nothing installs on its own.
func (a *App) watchClaudeUpdates(ctx context.Context) {
	check := func() {
		probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		snapshot := provider.ProbeVersion(probeCtx, "claude", domain.ProviderSettings{})
		if snapshot.Availability != domain.AvailabilityReady || snapshot.Version == "" {
			return
		}
		advisory := cliupdate.Check(probeCtx, cliupdate.ClaudePackage, snapshot.Version)
		if advisory.Available {
			a.emit(cliUpdateChannel, map[string]string{
				"installed": advisory.Installed,
				"latest":    advisory.Latest,
			})
		}
	}

	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			check()
		case <-ticker.C:
			check()
		}
	}
}

func tailLines(text string, count int) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	if len(lines) <= count {
		return strings.TrimSpace(text)
	}
	return strings.Join(lines[len(lines)-count:], "\n")
}
