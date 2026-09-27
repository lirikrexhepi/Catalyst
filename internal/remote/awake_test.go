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
		{"in the background", []clientPresence{{keepAwake: true, at: now}}, false},
		{"stale report", []clientPresence{{visible: true, keepAwake: true, at: now.Add(-presenceTTL - time.Second)}}, false},
		{"one of two phones", []clientPresence{{visible: true, at: now}, {visible: true, keepAwake: true, at: now}}, true},
	}
	for _, c := range cases {
		s := &Server{presence: make(map[*websocket.Conn]clientPresence)}
		for _, p := range c.presence {
			s.presence[&websocket.Conn{}] = p
		}
		if got := s.wantAwake(); got != c.want {
			t.Errorf("%s: wantAwake() = %v, want %v", c.name, got, c.want)
		}
	}
}
