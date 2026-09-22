package opencode

import (
	"context"
	"net/http"
	"sync"
	"time"

	"composer/internal/domain"
)

const goQuotaTTL = 60 * time.Second

const goQuotaTimeout = 10 * time.Second

const goQuotaBudget = 25 * time.Second

type GoQuotaSource struct {
	ttl    time.Duration
	client *http.Client

	mu        sync.Mutex
	limits    []domain.RateLimit
	fetchedAt int64
	err       error
	checkedAt time.Time
	inflight  bool
	onUpdate  func()
}

func NewGoQuotaSource() *GoQuotaSource {
	return &GoQuotaSource{
		ttl:    goQuotaTTL,
		client: &http.Client{Timeout: goQuotaTimeout},
	}
}

func (s *GoQuotaSource) OnUpdate(notify func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onUpdate = notify
}

func (s *GoQuotaSource) Snapshot() ([]domain.RateLimit, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.inflight && time.Since(s.checkedAt) >= s.ttl {
		s.inflight = true
		go s.refresh()
	}

	return s.limits, s.fetchedAt, s.err
}

func (s *GoQuotaSource) Invalidate() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checkedAt = time.Time{}
}

func (s *GoQuotaSource) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), goQuotaBudget)
	defer cancel()

	limits, fetchedAt, err := FetchGoQuota(ctx, s.client)
	s.store(limits, fetchedAt, err)
}

func (s *GoQuotaSource) store(limits []domain.RateLimit, fetchedAt int64, err error) {
	s.mu.Lock()

	s.inflight = false
	s.checkedAt = time.Now()
	s.err = err
	if len(limits) > 0 {
		s.limits, s.fetchedAt = limits, fetchedAt
	}
	notify := s.onUpdate
	s.mu.Unlock()

	if notify != nil {
		notify()
	}
}
