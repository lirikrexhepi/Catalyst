package session

import "sync"

type TurnNotes struct {
	mu    sync.Mutex
	notes map[string]func() string
}

func (n *TurnNotes) Queue(threadID string, note func() string) {
	if threadID == "" || note == nil {
		return
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.notes == nil {
		n.notes = make(map[string]func() string)
	}
	n.notes[threadID] = note
}

func (n *TurnNotes) take(threadID string) string {
	n.mu.Lock()
	note := n.notes[threadID]
	delete(n.notes, threadID)
	n.mu.Unlock()
	if note == nil {
		return ""
	}
	return note()
}

func (m *Manager) QueueTurnNote(threadID string, note func() string) {
	m.notes.Queue(threadID, note)
}
