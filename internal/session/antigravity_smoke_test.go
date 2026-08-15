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

// TestAntigravityRoundTrip drives two turns so conversation resume is covered:
// the second turn must reuse the id reported by the first.
func TestAntigravityRoundTrip(t *testing.T) {
	env := shell.BaseEnvironment()
	if _, ok := shell.LookPath("agy", env); !ok {
		t.Skip("agy CLI not installed")
	}

	manager := NewManager(provider.NewRegistry(drivers.All()...))
	events, unsubscribe := manager.Bus().Subscribe()
	defer unsubscribe()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	if _, err := manager.Start(ctx, domain.DriverAntigravity, domain.SessionStartInput{
		ThreadID: "agy-1",
		Cwd:      cwd,
	}); err != nil {
		t.Fatalf("start session: %v", err)
	}
	defer manager.StopAll(context.Background())

	firstID := runTurn(t, manager, events, "agy-1", "turn-1", "Reply with exactly: CATALYST_OK", "CATALYST_OK")
	if firstID == "" {
		t.Fatal("expected conversation id from init frame")
	}
	t.Logf("conversation id: %s", firstID)

	// The second turn must reuse the conversation, so the agent still has the
	// first turn in context.
	runTurn(t, manager, events, "agy-1", "turn-2", "What word did I ask you to reply with a moment ago?", "CATALYST_OK")
}

func runTurn(t *testing.T, manager *Manager, events <-chan domain.RuntimeEvent, threadID, turnID, prompt, want string) string {
	t.Helper()

	if err := manager.Send(context.Background(), domain.SendTurnInput{
		ThreadID: threadID, TurnID: turnID, Text: prompt,
	}); err != nil {
		t.Fatalf("send turn: %v", err)
	}

	var text strings.Builder
	var conversationID string
	deadline := time.After(3 * time.Minute)
	for {
		select {
		case <-deadline:
			t.Fatalf("timed out on %s", turnID)
		case event := <-events:
			switch event.Kind {
			case domain.EventSessionStarted:
				if event.Text != "" {
					conversationID = event.Text
				}
			case domain.EventAgentMessage:
				text.WriteString(event.Text)
			case domain.EventToolCall:
				t.Logf("tool call: %s", event.Tool.Name)
			case domain.EventTurnFailed:
				t.Fatalf("turn failed: %s", event.Error)
			case domain.EventTurnCompleted:
				if !strings.Contains(text.String(), want) {
					t.Errorf("%s: expected %q in %q", turnID, want, text.String())
				}
				return conversationID
			}
		}
	}
}
