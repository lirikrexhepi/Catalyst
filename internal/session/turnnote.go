package session

import "sync"

// TurnNotes holds one-shot context the app wants an agent to see with its
// next turn, such as a dev server the app started for it. The note rides in
// the text sent to the CLI only; the transcript keeps the user's own words.
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

// QueueTurnNote attaches a note to the next message sent to the thread. The
// function runs at send time, so a note about something that has since gone
// away can return "" and nothing is added.
func (m *Manager) QueueTurnNote(threadID string, note func() string) {
	m.notes.Queue(threadID, note)
}
