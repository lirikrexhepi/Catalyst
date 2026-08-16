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

	// recorder persists transcripts. Optional: a manager without one behaves
	// exactly as before, which keeps every existing test unchanged.
	recorder Recorder
}

// Recorder receives events for durable storage. Implemented by the history
// store; kept as an interface so the manager does not depend on the file layer
// and tests can observe what would be written.
type Recorder interface {
	// Record persists one event for a thread. Called on the publishing
	// goroutine, so implementations must be cheap and must not block.
	Record(threadID string, event domain.RuntimeEvent)
	// NoteProviderSession records the id a CLI needs to resume this thread in a
	// later run.
	NoteProviderSession(threadID, providerSessionID string)
}

// SetRecorder attaches durable storage. Safe to call before any session starts.
func (m *Manager) SetRecorder(recorder Recorder) {
	m.mu.Lock()
	m.recorder = recorder
	m.mu.Unlock()
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

// SessionPID reports the CLI process for a thread when its adapter tracks one.
func (m *Manager) SessionPID(threadID string) (int, bool) {
	m.mu.RLock()
	entry, ok := m.threads[threadID]
	m.mu.RUnlock()
	if !ok {
		return 0, false
	}
	reporter, ok := entry.adapter.(provider.ProcessReporter)
	if !ok {
		return 0, false
	}
	return reporter.SessionPID(threadID)
}

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
	// Adapters report their own events and do not all know their driver kind, so
	// the manager fills it in from the thread's session. Consumers that group by
	// CLI (usage totals, diagnostics) depend on this being present.
	if event.Driver == "" && event.ThreadID != "" {
		m.mu.RLock()
		if entry, ok := m.threads[event.ThreadID]; ok {
			event.Driver = entry.session.Driver
		}
		m.mu.RUnlock()
	}

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
	recorder := m.recorder
	m.mu.Unlock()

	// Outside the lock: persistence must never widen the critical section that
	// every streamed token passes through.
	if recorder != nil {
		recorder.Record(published.ThreadID, published)

		// A turn boundary is the cheap moment to catch a resume id that only
		// became known once the stream opened.
		switch published.Kind {
		case domain.EventSessionStarted, domain.EventTurnCompleted, domain.EventTurnFailed:
			go m.refreshProviderSession(published.ThreadID)
		}
	}
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

	// Registered before the adapter starts: StartSession emits session.started
	// synchronously on some drivers, and record() stamps the driver from this
	// map. Registering afterwards would leave those first events unattributed.
	m.mu.Lock()
	m.threads[in.ThreadID] = &record{
		session: domain.Session{ThreadID: in.ThreadID, Driver: kind, Cwd: in.Cwd, Model: in.Model},
		adapter: adapter,
	}
	m.mu.Unlock()

	session, err := adapter.StartSession(ctx, in)
	if err != nil {
		m.mu.Lock()
		delete(m.threads, in.ThreadID)
		m.mu.Unlock()
		return domain.Session{}, err
	}

	if session.Driver == "" {
		session.Driver = kind
	}

	m.mu.Lock()
	m.threads[in.ThreadID] = &record{session: session, adapter: adapter}
	recorder := m.recorder
	m.mu.Unlock()

	// The id a CLI needs to resume later. Some drivers know it here; others
	// (Claude) learn it once the stream opens and are picked up by refreshSession.
	if recorder != nil && session.ProviderSessionID != "" {
		recorder.NoteProviderSession(in.ThreadID, session.ProviderSessionID)
	}

	return session, nil
}

// refreshProviderSession re-reads a thread's session from its adapter and stores
// any resume id that appeared after start.
//
// Claude reports its session id asynchronously, so the value captured at start
// is often empty; without this a Claude thread could never be resumed.
func (m *Manager) refreshProviderSession(threadID string) {
	m.mu.RLock()
	entry, ok := m.threads[threadID]
	recorder := m.recorder
	m.mu.RUnlock()
	if !ok || recorder == nil {
		return
	}

	reporter, ok := entry.adapter.(provider.SessionReporter)
	if !ok {
		return
	}
	session, ok := reporter.Session(threadID)
	if !ok || session.ProviderSessionID == "" {
		return
	}

	m.mu.Lock()
	if current, live := m.threads[threadID]; live {
		current.session.ProviderSessionID = session.ProviderSessionID
	}
	m.mu.Unlock()

	recorder.NoteProviderSession(threadID, session.ProviderSessionID)
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
