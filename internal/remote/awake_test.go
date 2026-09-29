package remote

import (
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWantAwakeOnlyWhileAPhoneShowsTheAppWithTheSettingOn(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name     string
		presence []clientPresence
		want     bool
	}{
		{"no phones", nil, false},
		{"open with setting on", []clientPresence{{visible: true, keepAwake: true, at: now}}, true},
		{"open with setting off", []clientPresence{{visible: true, at: now}}, false},
		{"in the background without recent visible", []clientPresence{{keepAwake: true, at: now}}, false},
		{"in the background with recent visible", []clientPresence{{keepAwake: true, at: now, lastVisible: now.Add(-time.Minute)}}, true},
		{"in the background with expired visible", []clientPresence{{keepAwake: true, at: now, lastVisible: now.Add(-awakeCoolOff - time.Minute)}}, false},
		{"stale report", []clientPresence{{visible: true, keepAwake: true, at: now.Add(-presenceTTL - time.Second)}}, false},
		{"one of two phones", []clientPresence{{visible: true, at: now}, {visible: true, keepAwake: true, at: now}}, true},
	}
	for _, c := range cases {
		s := &Server{presence: make(map[*websocket.Conn]clientPresence)}
		for _, p := range c.presence {
			s.presence[&websocket.Conn{}] = p
		}
		if got, _ := s.wantAwake(); got != c.want {
			t.Errorf("%s: wantAwake() = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestWantAwakeWithRecentWork(t *testing.T) {
	now := time.Now()
	s := &Server{
		presence:   make(map[*websocket.Conn]clientPresence),
		lastWorkAt: now.Add(-time.Minute),
	}
	if got, _ := s.wantAwake(); !got {
		t.Errorf("wantAwake() with recent work = false, want true")
	}

	s.lastWorkAt = now.Add(-awakeCoolOff - time.Second)
	if got, _ := s.wantAwake(); got {
		t.Errorf("wantAwake() with expired work = true, want false")
	}
}
