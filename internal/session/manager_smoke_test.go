package session

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"catalyst/internal/domain"
	"catalyst/internal/drivers"
	"catalyst/internal/provider"
	"catalyst/internal/shell"
)

func TestProbeDiscoversInstalledClis(t *testing.T) {
	registry := provider.NewRegistry(drivers.All()...)
	snapshots := registry.Probe(context.Background(), true)

	if len(snapshots) != 4 {
		t.Fatalf("expected 4 drivers, got %d", len(snapshots))
	}
	for _, snapshot := range snapshots {
		if snapshot.Availability == "" {
			t.Errorf("%s: availability not set", snapshot.Driver)
		}
		t.Logf("%-12s %-14s version=%q path=%q", snapshot.Driver, snapshot.Availability, snapshot.Version, snapshot.CommandPath)
	}
}

// TestClaudeRoundTrip exercises the whole stack against the real CLI: spawn,
// stream-json parsing, event fan-out, and teardown.
func TestClaudeRoundTrip(t *testing.T) {
	env := shell.BaseEnvironment()
	if _, ok := shell.LookPath("claude", env); !ok {
		t.Skip("claude CLI not installed")
	}

	registry := provider.NewRegistry(drivers.All()...)
	manager := NewManager(registry)
	events, unsubscribe := manager.Bus().Subscribe()
	defer unsubscribe()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	session, err := manager.Start(ctx, domain.DriverClaude, domain.SessionStartInput{
		ThreadID:   "smoke-1",
		Cwd:        cwd,
		Permission: domain.PermissionPlan,
	})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	if session.ThreadID != "smoke-1" {
		t.Fatalf("unexpected session: %+v", session)
	}
	defer manager.StopAll(context.Background())

	if err := manager.Send(ctx, domain.SendTurnInput{
		ThreadID: "smoke-1",
		TurnID:   "turn-1",
		Text:     "Reply with exactly: CATALYST_OK",
	}); err != nil {
		t.Fatalf("send turn: %v", err)
	}

	var text strings.Builder
	var providerSessionID string
	deadline := time.After(2 * time.Minute)
	for {
		select {
		case <-deadline:
			t.Fatal("timed out waiting for turn completion")
		case event := <-events:
			switch event.Kind {
			case domain.EventSessionStarted:
				providerSessionID = event.Text
			case domain.EventAgentMessage:
				text.WriteString(event.Text)
			case domain.EventTurnFailed:
				t.Fatalf("turn failed: %s", event.Error)
			case domain.EventTurnCompleted:
				if providerSessionID == "" {
					t.Error("expected provider session id from init frame")
				}
				t.Logf("provider session id: %s", providerSessionID)
				if !strings.Contains(text.String(), "CATALYST_OK") {
					t.Errorf("unexpected agent text: %q", text.String())
				}
				if len(manager.History("smoke-1")) == 0 {
					t.Error("expected recorded transcript")
				}
				return
			}
		}
	}
}
