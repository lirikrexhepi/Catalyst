package remote

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"composer/internal/session"
)

func deleteRequest(s *Server, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/thread/delete", strings.NewReader(body))
	s.handleThreadDelete(rec, req)
	return rec
}

func TestThreadDeleteCallsHookWithThreadID(t *testing.T) {
	s := NewServer(0, nil, nil, nil, nil, nil, nil, nil)
	var got string
	s.SetHooks(Hooks{DeleteThread: func(id string) error {
		got = id
		return nil
	}})
	if rec := deleteRequest(s, `{"threadId":"t-1"}`); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got != "t-1" {
		t.Fatalf("hook got %q, want t-1", got)
	}
}

func TestThreadDeleteRejectsBadRequests(t *testing.T) {
	s := NewServer(0, nil, nil, nil, nil, nil, nil, nil)
	called := false
	s.SetHooks(Hooks{DeleteThread: func(string) error {
		called = true
		return errors.New("not found")
	}})
	cases := map[string]int{
		`{}`: http.StatusBadRequest,
		`{"threadId":"` + session.CoordinatorThreadID + `"}`: http.StatusBadRequest,
		`{"threadId":"missing"}`: http.StatusNotFound,
	}
	for body, want := range cases {
		if rec := deleteRequest(s, body); rec.Code != want {
			t.Fatalf("body %s: status %d, want %d", body, rec.Code, want)
		}
	}
	if !called {
		t.Fatal("hook was never reached for a valid thread id")
	}
	rec := httptest.NewRecorder()
	s.handleThreadDelete(rec, httptest.NewRequest(http.MethodGet, "/api/thread/delete", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET status = %d, want 405", rec.Code)
	}
}
