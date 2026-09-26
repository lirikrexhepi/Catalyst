package remote

import (
	"reflect"
	"testing"

	"composer/internal/domain"
)

func TestDriverTrailKeepsOrderAndEndsWithCurrent(t *testing.T) {
	cases := []struct {
		used    []domain.DriverKind
		current string
		want    []string
	}{
		{nil, "claude", []string{"claude"}},
		{[]domain.DriverKind{"antigravity", "claude"}, "claude", []string{"antigravity", "claude"}},
		{[]domain.DriverKind{"claude", "antigravity"}, "claude", []string{"antigravity", "claude"}},
		{[]domain.DriverKind{"opencode", "opencode", "claude"}, "", []string{"opencode", "claude"}},
		{nil, "", []string{}},
	}
	for _, c := range cases {
		if got := driverTrail(c.used, c.current); !reflect.DeepEqual(got, c.want) {
			t.Fatalf("driverTrail(%v, %q) = %v, want %v", c.used, c.current, got, c.want)
		}
	}
}

func TestSummarizeCollectsDriversFromEvents(t *testing.T) {
	row := ThreadSummary{Driver: "opencode"}
	summarize(&row, []domain.RuntimeEvent{
		{Kind: domain.EventUserMessage, Driver: "antigravity", At: 1},
		{Kind: domain.EventUserMessage, Driver: "Antigravity", At: 2},
		{Kind: domain.EventUserMessage, Driver: "opencode", At: 3},
	})
	if want := []string{"antigravity", "opencode"}; !reflect.DeepEqual(row.Drivers, want) {
		t.Fatalf("drivers = %v, want %v", row.Drivers, want)
	}
}
