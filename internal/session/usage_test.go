package session

import (
	"testing"

	"catalyst/internal/domain"
)

func usageEvent(thread, turn string, driver domain.DriverKind, in, out int64) domain.RuntimeEvent {
	return domain.RuntimeEvent{
		Kind:     domain.EventUsage,
		ThreadID: thread,
		TurnID:   turn,
		Driver:   driver,
		Usage:    &domain.Usage{InputTokens: in, OutputTokens: out},
	}
}

func TestUsageDoesNotDoubleCountCumulativeReports(t *testing.T) {
	tracker := NewUsageTracker()

	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 10))
	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 40))
	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 90))

	report := tracker.Report()
	if len(report.Drivers) != 1 {
		t.Fatalf("expected 1 driver, got %d", len(report.Drivers))
	}

	got := report.Drivers[0]
	if got.InputTokens != 100 {
		t.Errorf("input tokens = %d, want 100 (cumulative reports must not sum)", got.InputTokens)
	}
	if got.OutputTokens != 90 {
		t.Errorf("output tokens = %d, want 90 (only the final total for the turn)", got.OutputTokens)
	}
}

func TestUsageAccumulatesAcrossTurns(t *testing.T) {
	tracker := NewUsageTracker()

	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 50))
	tracker.Observe(domain.RuntimeEvent{
		Kind: domain.EventTurnCompleted, ThreadID: "t1", TurnID: "turn-1", Driver: domain.DriverClaude,
	})
	tracker.Observe(usageEvent("t1", "turn-2", domain.DriverClaude, 200, 70))

	report := tracker.Report()
	got := report.Drivers[0]
	if got.InputTokens != 300 {
		t.Errorf("input tokens = %d, want 300", got.InputTokens)
	}
	if got.OutputTokens != 120 {
		t.Errorf("output tokens = %d, want 120", got.OutputTokens)
	}
	if got.Turns != 1 {
		t.Errorf("turns = %d, want 1", got.Turns)
	}
}

func TestUsageSeparatesDrivers(t *testing.T) {
	tracker := NewUsageTracker()

	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 50))
	tracker.Observe(usageEvent("t2", "turn-1", domain.DriverAntigravity, 400, 200))

	report := tracker.Report()
	if len(report.Drivers) != 2 {
		t.Fatalf("expected 2 drivers, got %d", len(report.Drivers))
	}

	// Heaviest spender sorts first.
	if report.Drivers[0].Driver != domain.DriverAntigravity {
		t.Errorf("first driver = %q, want antigravity (sorted by spend)", report.Drivers[0].Driver)
	}
	if report.Totals.InputTokens != 500 || report.Totals.OutputTokens != 250 {
		t.Errorf("totals = %d in / %d out, want 500 / 250",
			report.Totals.InputTokens, report.Totals.OutputTokens)
	}
}

func TestUsageFallsBackToThreadDriver(t *testing.T) {
	tracker := NewUsageTracker()

	tracker.Observe(domain.RuntimeEvent{
		Kind: domain.EventSessionStarted, ThreadID: "t1", Driver: domain.DriverClaude,
	})
	// A later event with no driver still attributes to the thread's CLI.
	tracker.Observe(usageEvent("t1", "turn-1", "", 100, 50))

	report := tracker.Report()
	if len(report.Drivers) != 1 || report.Drivers[0].Driver != domain.DriverClaude {
		t.Fatalf("expected usage attributed to claude, got %+v", report.Drivers)
	}
	if report.Drivers[0].InputTokens != 100 {
		t.Errorf("input tokens = %d, want 100", report.Drivers[0].InputTokens)
	}
}

func TestUsageIgnoresShrinkingTotals(t *testing.T) {
	tracker := NewUsageTracker()

	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 500, 300))
	// A malformed or reset report must not subtract from the running total.
	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 10, 5))

	report := tracker.Report()
	if report.Drivers[0].InputTokens != 500 {
		t.Errorf("input tokens = %d, want 500 (must never decrease)", report.Drivers[0].InputTokens)
	}
}

func pct(value int) *int { return &value }

func TestRateLimitWindowsMergeRatherThanAccumulate(t *testing.T) {
	tracker := NewUsageTracker()

	limit := func(window string, used int, resets int64) domain.RuntimeEvent {
		return domain.RuntimeEvent{
			Kind: domain.EventRateLimit, ThreadID: "t1", Driver: domain.DriverClaude,
			RateLimits: []domain.RateLimit{
				{Window: window, Status: "allowed", UsedPercent: pct(used), ResetsAt: resets},
			},
		}
	}

	tracker.Observe(limit("five_hour", 10, 100))
	tracker.Observe(limit("seven_day", 60, 900))
	tracker.Observe(limit("five_hour", 15, 100))

	limits := tracker.Report().Drivers[0].Limits
	if len(limits) != 2 {
		t.Fatalf("expected 2 windows, got %d: %+v", len(limits), limits)
	}

	byWindow := map[string]domain.RateLimit{}
	for _, l := range limits {
		byWindow[l.Window] = l
	}
	if got := byWindow["five_hour"]; got.UsedPercent == nil || *got.UsedPercent != 15 {
		t.Errorf("five_hour should hold the newest value 15, got %+v", got.UsedPercent)
	}
	if got := byWindow["seven_day"]; got.UsedPercent == nil || *got.UsedPercent != 60 {
		t.Errorf("seven_day = %+v, want 60", got.UsedPercent)
	}
}

func TestRateLimitSurvivesReset(t *testing.T) {
	tracker := NewUsageTracker()

	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 50))
	tracker.Observe(domain.RuntimeEvent{
		Kind: domain.EventRateLimit, ThreadID: "t1", Driver: domain.DriverClaude,
		RateLimits: []domain.RateLimit{{Window: "five_hour", UsedPercent: pct(42)}},
	})

	tracker.Reset()

	report := tracker.Report()
	if len(report.Drivers) != 1 {
		t.Fatalf("quota should outlive a counter reset, got %d drivers", len(report.Drivers))
	}
	if report.Drivers[0].InputTokens != 0 {
		t.Errorf("token counters should be cleared, got %d", report.Drivers[0].InputTokens)
	}
	limits := report.Drivers[0].Limits
	if len(limits) != 1 || limits[0].UsedPercent == nil || *limits[0].UsedPercent != 42 {
		t.Errorf("quota not carried across reset: %+v", limits)
	}
}

func TestUsageResetClearsTotals(t *testing.T) {
	tracker := NewUsageTracker()
	tracker.Observe(usageEvent("t1", "turn-1", domain.DriverClaude, 100, 50))

	tracker.Reset()

	report := tracker.Report()
	if len(report.Drivers) != 0 {
		t.Fatalf("expected no drivers after reset, got %d", len(report.Drivers))
	}
	if report.Totals.InputTokens != 0 {
		t.Errorf("totals not cleared: %d", report.Totals.InputTokens)
	}
}
