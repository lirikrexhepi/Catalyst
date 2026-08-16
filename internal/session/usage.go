package session

import (
	"sort"
	"sync"
	"time"

	"catalyst/internal/domain"
)

// DriverUsage is the running total for one CLI.
type DriverUsage struct {
	Driver           domain.DriverKind `json:"driver"`
	InputTokens      int64             `json:"inputTokens"`
	OutputTokens     int64             `json:"outputTokens"`
	CacheReadTokens  int64             `json:"cacheReadTokens"`
	CacheWriteTokens int64             `json:"cacheWriteTokens"`
	CostUSD          float64           `json:"costUsd"`
	Turns            int64             `json:"turns"`
	Sessions         int64             `json:"sessions"`
	LastActiveAt     int64             `json:"lastActiveAt,omitempty"`
	// Limits is subscription quota as the CLI reports it, not something derived
	// from the token counts above. Empty when the CLI never reports quota.
	Limits []domain.RateLimit `json:"limits,omitempty"`
	// LimitsFetchedAt is when the CLI last refreshed those figures, so the UI can
	// show staleness instead of passing an old reading off as current.
	LimitsFetchedAt int64 `json:"limitsFetchedAt,omitempty"`
	// LimitsError explains why quota is missing or stale for this CLI.
	LimitsError string `json:"limitsError,omitempty"`
}

// UsageReport is the whole picture the usage panel renders.
type UsageReport struct {
	Drivers   []DriverUsage `json:"drivers"`
	Totals    DriverUsage   `json:"totals"`
	StartedAt int64         `json:"startedAt"`
}

// SetLimits records quota read from a source outside the event stream, such as
// a CLI's own on-disk cache. Reported windows replace stored ones by name.
func (t *UsageTracker) SetLimits(driver domain.DriverKind, limits []domain.RateLimit, fetchedAt int64) {
	if driver == "" || len(limits) == 0 {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	entry := t.drivers[driver]
	if entry == nil {
		entry = &DriverUsage{Driver: driver}
		t.drivers[driver] = entry
	}
	t.mergeLimits(entry, limits)
	entry.LimitsFetchedAt = fetchedAt
	entry.LimitsError = ""
}

// SetQuotaError records why a CLI's limits are missing. Stored per driver so a
// signed-out or offline CLI explains itself instead of silently showing nothing.
func (t *UsageTracker) SetQuotaError(driver domain.DriverKind, message string) {
	if driver == "" {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	entry := t.drivers[driver]
	if entry == nil {
		entry = &DriverUsage{Driver: driver}
		t.drivers[driver] = entry
	}
	// A previous good reading is kept: a transient failure should not blank a
	// figure the user was just looking at.
	entry.LimitsError = message
}

// UsageTracker accumulates per-driver token spend from the event stream.
//
// Usage events are cumulative per turn rather than incremental: an adapter
// re-reports the running total for a turn as it progresses. Summing them
// directly would multiply-count a long turn, so the last value seen for each
// turn is kept and the delta against it is what accrues.
type UsageTracker struct {
	mu        sync.RWMutex
	drivers   map[domain.DriverKind]*DriverUsage
	turns     map[string]domain.Usage
	threads   map[string]domain.DriverKind
	startedAt int64
}

func NewUsageTracker() *UsageTracker {
	return &UsageTracker{
		drivers:   make(map[domain.DriverKind]*DriverUsage),
		turns:     make(map[string]domain.Usage),
		threads:   make(map[string]domain.DriverKind),
		startedAt: time.Now().UnixMilli(),
	}
}

// Observe folds one runtime event into the totals.
func (t *UsageTracker) Observe(event domain.RuntimeEvent) {
	t.mu.Lock()
	defer t.mu.Unlock()

	driver := event.Driver
	if driver == "" {
		// Only usage/session events carry the driver on every adapter, so fall
		// back to the driver this thread was started with.
		driver = t.threads[event.ThreadID]
	}
	if driver == "" {
		return
	}

	entry := t.drivers[driver]
	if entry == nil {
		entry = &DriverUsage{Driver: driver}
		t.drivers[driver] = entry
	}

	switch event.Kind {
	case domain.EventSessionStarted:
		t.threads[event.ThreadID] = driver
		entry.Sessions++
		entry.LastActiveAt = event.At

	case domain.EventTurnCompleted, domain.EventTurnFailed:
		entry.Turns++
		entry.LastActiveAt = event.At
		delete(t.turns, turnKey(event))

	case domain.EventRateLimit:
		t.mergeLimits(entry, event.RateLimits)

	case domain.EventUsage, domain.EventAgentMessage:
		if event.Usage == nil {
			return
		}
		t.accrue(entry, event)
		entry.LastActiveAt = event.At
	}
}

// mergeLimits replaces each reported window in place. Windows arrive one frame
// at a time, so appending would accumulate stale duplicates of the same window.
func (t *UsageTracker) mergeLimits(entry *DriverUsage, incoming []domain.RateLimit) {
	for _, limit := range incoming {
		if limit.Window == "" {
			continue
		}
		replaced := false
		for i, existing := range entry.Limits {
			if existing.Window == limit.Window {
				entry.Limits[i] = limit
				replaced = true
				break
			}
		}
		if !replaced {
			entry.Limits = append(entry.Limits, limit)
		}
	}
}

// accrue adds only what is new since this turn's previous report.
func (t *UsageTracker) accrue(entry *DriverUsage, event domain.RuntimeEvent) {
	key := turnKey(event)
	previous := t.turns[key]
	current := *event.Usage

	entry.InputTokens += positive(current.InputTokens - previous.InputTokens)
	entry.OutputTokens += positive(current.OutputTokens - previous.OutputTokens)
	entry.CacheReadTokens += positive(current.CacheReadTokens - previous.CacheReadTokens)
	entry.CacheWriteTokens += positive(current.CacheWriteTokens - previous.CacheWriteTokens)
	if current.CostUSD > previous.CostUSD {
		entry.CostUSD += current.CostUSD - previous.CostUSD
	}

	t.turns[key] = current
}

// Report returns a stable snapshot ordered by spend, heaviest first.
func (t *UsageTracker) Report() UsageReport {
	t.mu.RLock()
	defer t.mu.RUnlock()

	report := UsageReport{
		Drivers:   make([]DriverUsage, 0, len(t.drivers)),
		StartedAt: t.startedAt,
	}
	for _, entry := range t.drivers {
		report.Drivers = append(report.Drivers, *entry)
		report.Totals.InputTokens += entry.InputTokens
		report.Totals.OutputTokens += entry.OutputTokens
		report.Totals.CacheReadTokens += entry.CacheReadTokens
		report.Totals.CacheWriteTokens += entry.CacheWriteTokens
		report.Totals.CostUSD += entry.CostUSD
		report.Totals.Turns += entry.Turns
		report.Totals.Sessions += entry.Sessions
		if entry.LastActiveAt > report.Totals.LastActiveAt {
			report.Totals.LastActiveAt = entry.LastActiveAt
		}
	}

	sort.Slice(report.Drivers, func(i, j int) bool {
		left, right := report.Drivers[i], report.Drivers[j]
		leftTotal := left.InputTokens + left.OutputTokens
		rightTotal := right.InputTokens + right.OutputTokens
		if leftTotal != rightTotal {
			return leftTotal > rightTotal
		}
		return left.Driver < right.Driver
	})
	return report
}

// Reset clears counters so a user can measure a single piece of work.
//
// Subscription quota survives: it describes the account's standing with the
// provider, which a local counter reset has no bearing on. Clearing it would
// blank the meter until the next agent run happened to report it again.
func (t *UsageTracker) Reset() {
	t.mu.Lock()
	defer t.mu.Unlock()

	carried := make(map[domain.DriverKind]*DriverUsage, len(t.drivers))
	for driver, entry := range t.drivers {
		if len(entry.Limits) > 0 || entry.LimitsError != "" {
			carried[driver] = &DriverUsage{
				Driver:          driver,
				Limits:          entry.Limits,
				LimitsFetchedAt: entry.LimitsFetchedAt,
				LimitsError:     entry.LimitsError,
			}
		}
	}

	t.drivers = carried
	t.turns = make(map[string]domain.Usage)
	t.startedAt = time.Now().UnixMilli()
}

func turnKey(event domain.RuntimeEvent) string {
	if event.TurnID != "" {
		return event.ThreadID + "\x00" + event.TurnID
	}
	return event.ThreadID
}

func positive(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}
