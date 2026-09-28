package cliupdate

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompare(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"2.1.283", "2.1.284", -1},
		{"2.1.284", "2.1.284", 0},
		{"2.1.284", "2.1.283", 1},
		{"2.1.9", "2.1.19", -1},
		{"2.1.284 (Claude Code)", "2.1.284", 0},
		{"", "2.1.284", -1},
	}
	for _, tc := range cases {
		if got := Compare(tc.a, tc.b); got != tc.want {
			t.Fatalf("Compare(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestLatestDecodesRegistryShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"name":"x","version":"9.9.9"}`)
	}))
	defer server.Close()

	latest, err := latestFrom(t.Context(), server.URL)
	if err != nil {
		t.Fatalf("latestFrom: %v", err)
	}
	if latest != "9.9.9" {
		t.Fatalf("latest = %q, want 9.9.9", latest)
	}
}

func TestLatestRejectsBadAnswers(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	if _, err := latestFrom(t.Context(), server.URL); err == nil {
		t.Fatalf("expected an error for a 404 answer")
	}
}

func TestCheckEmptyInputYieldsZeroAdvisory(t *testing.T) {
	if got := Check(t.Context(), "", "2.1.284"); got != (Advisory{}) {
		t.Fatalf("expected zero advisory, got %+v", got)
	}
	if got := Check(t.Context(), "@anthropic-ai/claude-code", ""); got != (Advisory{}) {
		t.Fatalf("expected zero advisory, got %+v", got)
	}
}
