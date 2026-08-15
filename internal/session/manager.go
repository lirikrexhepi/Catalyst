package session

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"

	"catalyst/internal/domain"
	"catalyst/internal/provider"
)

// Manager owns every live agent session across providers. Adapters are created
// per driver and shared by the threads that use them, so a single Codex
// app-server or OpenCode server backs many concurrent threads.
type Manager struct {
	registry *provider.Registry
	bus      *Bus

	mu       sync.RWMutex
	adapters map[domain.DriverKind]provider.Adapter
	threads  map[string]*record
	history  map[string][]domain.RuntimeEvent
}

type record struct {
	session domain.Session
	adapter provider.Adapter
}

const historyLimit = 2000

func NewManager(registry *provider.Registry) *Manager {
	return &Manager{
		registry: registry,
		bus:      NewBus(),
		adapters: make(map[domain.DriverKind]provider.Adapter),
		threads:  make(map[string]*record),
		history:  make(map[string][]domain.RuntimeEvent),
	}
}

func (m *Manager) Bus() *Bus { return m.bus }

func (m *Manager) adapterFor(kind domain.DriverKind) (provider.Adapter, error) {
	m.mu.RLock()
	adapter, ok := m.adapters[kind]
	m.mu.RUnlock()
	if ok {
		return adapter, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if adapter, ok := m.adapters[kind]; ok {
		return adapter, nil
	}

	adapter, err := m.registry.NewAdapter(kind, provider.EmitterFunc(m.record))
	if err != nil {
		return nil, err
	}
	m.adapters[kind] = adapter
	return adapter, nil
}

// record stamps the event, appends it to the thread transcript, and publishes.
func (m *Manager) record(event domain.RuntimeEvent) {
	published := m.bus.Publish(event)

	if published.ThreadID == "" {
		return
	}
	m.mu.Lock()
	transcript := append(m.history[published.ThreadID], published)
	if len(transcript) > historyLimit {
		transcript = transcript[len(transcript)-historyLimit:]
	}
	m.history[published.ThreadID] = transcript
	m.mu.Unlock()
}

func (m *Manager) Start(ctx context.Context, kind domain.DriverKind, in domain.SessionStartInput) (domain.Session, error) {
	if in.ThreadID == "" {
		return domain.Session{}, errors.New("threadId is required")
	}

	m.mu.RLock()
	_, exists := m.threads[in.ThreadID]
	m.mu.RUnlock()
	if exists {
		return domain.Session{}, fmt.Errorf("thread %s already has an active session", in.ThreadID)
	}

	adapter, err := m.adapterFor(kind)
	if err != nil {
		return domain.Session{}, err
	}

	session, err := adapter.StartSession(ctx, in)
	if err != nil {
		return domain.Session{}, err
	}

	m.mu.Lock()
	m.threads[in.ThreadID] = &record{session: session, adapter: adapter}
	m.mu.Unlock()

	return session, nil
}

func (m *Manager) Send(ctx context.Context, in domain.SendTurnInput) error {
	entry, err := m.lookup(in.ThreadID)
	if err != nil {
		return err
	}
	return entry.adapter.SendTurn(ctx, in)
}

func (m *Manager) Interrupt(ctx context.Context, threadID string) error {
	entry, err := m.lookup(threadID)
	if err != nil {
		return err
	}
	return entry.adapter.InterruptTurn(ctx, threadID)
}

func (m *Manager) Respond(ctx context.Context, threadID, requestID string, decision domain.ApprovalDecision) error {
	entry, err := m.lookup(threadID)
	if err != nil {
		return err
	}
	return entry.adapter.RespondToApproval(ctx, threadID, requestID, decision)
}

func (m *Manager) Stop(ctx context.Context, threadID string) error {
	m.mu.Lock()
	entry, ok := m.threads[threadID]
	delete(m.threads, threadID)
	m.mu.Unlock()
	if !ok {
		return nil
	}
	return entry.adapter.StopSession(ctx, threadID)
}

// StopAll tears down every adapter. Called on app shutdown so no agent CLI
// outlives the window.
func (m *Manager) StopAll(ctx context.Context) {
	m.mu.Lock()
	adapters := make([]provider.Adapter, 0, len(m.adapters))
	for _, adapter := range m.adapters {
		adapters = append(adapters, adapter)
	}
	m.adapters = make(map[domain.DriverKind]provider.Adapter)
	m.threads = make(map[string]*record)
	m.mu.Unlock()

	var wg sync.WaitGroup
	for _, adapter := range adapters {
		wg.Add(1)
		go func(adapter provider.Adapter) {
			defer wg.Done()
			_ = adapter.StopAll(ctx)
		}(adapter)
	}
	wg.Wait()
}

func (m *Manager) Sessions() []domain.Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]domain.Session, 0, len(m.threads))
	for _, entry := range m.threads {
		out = append(out, entry.session)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt < out[j].StartedAt })
	return out
}

func (m *Manager) History(threadID string) []domain.RuntimeEvent {
	m.mu.RLock()
	defer m.mu.RUnlock()
	transcript := m.history[threadID]
	out := make([]domain.RuntimeEvent, len(transcript))
	copy(out, transcript)
	return out
}

func (m *Manager) lookup(threadID string) (*record, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entry, ok := m.threads[threadID]
	if !ok {
		return nil, fmt.Errorf("no active session for thread %s", threadID)
	}
	return entry, nil
}
