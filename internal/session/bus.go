package session

import (
	"sync"
	"sync/atomic"
	"time"

	"catalyst/internal/domain"
)

const subscriberBuffer = 512

// Bus fans runtime events out to subscribers. Slow subscribers drop events
// rather than stalling an agent's read loop.
type Bus struct {
	seq atomic.Uint64

	mu          sync.RWMutex
	subscribers map[int]chan domain.RuntimeEvent
	nextID      int
}

func NewBus() *Bus {
	return &Bus{subscribers: make(map[int]chan domain.RuntimeEvent)}
}

func (b *Bus) Publish(event domain.RuntimeEvent) domain.RuntimeEvent {
	event.Seq = b.seq.Add(1)
	if event.At == 0 {
		event.At = time.Now().UnixMilli()
	}

	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, ch := range b.subscribers {
		select {
		case ch <- event:
		default:
		}
	}
	return event
}

func (b *Bus) Subscribe() (<-chan domain.RuntimeEvent, func()) {
	ch := make(chan domain.RuntimeEvent, subscriberBuffer)

	b.mu.Lock()
	id := b.nextID
	b.nextID++
	b.subscribers[id] = ch
	b.mu.Unlock()

	return ch, func() {
		b.mu.Lock()
		if existing, ok := b.subscribers[id]; ok {
			delete(b.subscribers, id)
			close(existing)
		}
		b.mu.Unlock()
	}
}
