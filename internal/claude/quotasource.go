package claude

import (
	"context"
	"net/http"
	"sync"
	"time"

	"composer/internal/domain"
)

// quotaTTL bounds how often the account is asked. The panel polls far faster
// than quota moves, and each poll would otherwise be a request.
const quotaTTL = 45 * time.Second

const quotaTimeout = 10 * time.Second

// quotaBudget covers the whole refresh: an expired sign-in costs a token
// exchange before the usage request, and the two share this deadline.
const quotaBudget = 25 * time.Second

// QuotaSource serves the newest utilisation it has and refreshes in the
// background, so opening the panel never waits on the network.
//
// A live fetch is preferred; the CLI's on-disk cache is the fallback, which is
// why a signed-out or offline app still shows the last figures the CLI saw
// rather than nothing.
type QuotaSource struct {
	home   string
	ttl    time.Duration
	client *http.Client

	mu        sync.Mutex
	limits    []domain.RateLimit
	fetchedAt int64
	err       error
	checkedAt time.Time
	inflight  bool
	seeded    bool
	onUpdate  func()
}

// OnUpdate registers a callback fired whenever a refresh lands.
//
// Refreshes finish on their own goroutine, so without this the only way for the
// UI to notice is to keep asking. The callback lets the panel repaint the moment
// figures arrive instead of on the next poll.
func (s *QuotaSource) OnUpdate(notify func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onUpdate = notify
}

func NewQuotaSource(home string) *QuotaSource {
	return &QuotaSource{
		home:   home,
		ttl:    quotaTTL,
		client: &http.Client{Timeout: quotaTimeout},
	}
}

// Snapshot returns the current figures, the time they were taken, and why they
// are stale if they are. It never blocks on a request.
func (s *QuotaSource) Snapshot() ([]domain.RateLimit, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.seeded {
		s.seeded = true
		if limits, fetchedAt, err := ReadQuota(s.home); err == nil && len(limits) > 0 {
			s.limits, s.fetchedAt = limits, fetchedAt
		}
	}
	if !s.inflight && time.Since(s.checkedAt) >= s.ttl {
		s.inflight = true
		go s.refresh()
	}

	return s.limits, s.fetchedAt, s.err
}

// Invalidate drops the freshness window so the next Snapshot starts a fetch.
func (s *QuotaSource) Invalidate() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkedAt = time.Time{}
}

func (s *QuotaSource) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), quotaBudget)
	defer cancel()

	limits, fetchedAt, err := FetchQuota(ctx, s.home, s.client)
	if err != nil {
		if cached, cachedAt, cacheErr := ReadQuota(s.home); cacheErr == nil && len(cached) > 0 {
			s.store(cached, cachedAt, err)
			return
		}
	}
	s.store(limits, fetchedAt, err)
}

// store keeps the last good reading when a refresh fails: a transient outage
// should surface as an explanation beside the figures, not blank them.
func (s *QuotaSource) store(limits []domain.RateLimit, fetchedAt int64, err error) {
	s.mu.Lock()

	s.inflight = false
	s.checkedAt = time.Now()
	s.err = err
	if len(limits) > 0 {
		s.limits, s.fetchedAt = limits, fetchedAt
	}
	notify := s.onUpdate
	s.mu.Unlock()

	// Announced outside the lock: a listener that reads back through Snapshot
	// would otherwise deadlock against the mutex still held here.
	if notify != nil {
		notify()
	}
}
