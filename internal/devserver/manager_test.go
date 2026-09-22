package devserver

import (
	"os/exec"
	"testing"
	"time"
)

func TestDetectPort(t *testing.T) {
	cases := []struct {
		line string
		want int
		ok   bool
	}{
		{"  ➜  Local:   http://localhost:5173/", 5173, true},
		{"dev server listening on http://localhost:45123", 45123, true},
		{"Listening on port 8080", 8080, true},
		{"listening on :3000", 3000, true},
		{"VITE v7.3.6  ready in 407 ms", 0, false},
		{"compiled successfully in 1.2s", 0, false},
	}
	for _, tc := range cases {
		got, ok := detectPort(tc.line)
		if ok != tc.ok || got != tc.want {
			t.Errorf("detectPort(%q) = %d,%v want %d,%v", tc.line, got, ok, tc.want, tc.ok)
		}
	}
}

func nodePath(t *testing.T) string {
	t.Helper()
	path, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node not installed")
	}
	return path
}

func waitFor(t *testing.T, condition func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func TestManagerRunsServerOutsideAnyTurn(t *testing.T) {
	node := nodePath(t)
	manager := NewManager()
	defer manager.StopAll()

	snapshot, err := manager.Start(Spec{
		Command:       node,
		Args:          []string{"-e", "console.log('listening on http://localhost:45999'); setInterval(()=>{}, 1000)"},
		Cwd:           t.TempDir(),
		OwnerThreadID: "thread-1",
	})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if snapshot.PID == 0 {
		t.Fatal("no pid reported")
	}
	if !snapshot.Managed || snapshot.Status != StatusRunning {
		t.Fatalf("unexpected snapshot %+v", snapshot)
	}

	if !waitFor(t, func() bool {
		for _, live := range manager.List() {
			if live.ID == snapshot.ID && live.Port == 45999 {
				return true
			}
		}
		return false
	}) {
		t.Fatalf("port never detected from logs: %v", manager.Logs(snapshot.ID))
	}

	if pids := manager.PIDs(); pids[snapshot.PID] != snapshot.ID {
		t.Errorf("PIDs() lost the running server: %v", pids)
	}

	if err := manager.Stop(snapshot.ID); err != nil {
		t.Fatalf("stop: %v", err)
	}
	if !waitFor(t, func() bool {
		for _, live := range manager.List() {
			if live.ID == snapshot.ID {
				return live.Status != StatusRunning
			}
		}
		return false
	}) {
		t.Error("server never settled after stop")
	}
}

func TestManagerReportsFailedStartup(t *testing.T) {
	node := nodePath(t)
	manager := NewManager()
	defer manager.StopAll()

	snapshot, err := manager.Start(Spec{
		Command: node,
		Args:    []string{"-e", "console.error('boom'); process.exit(3)"},
		Cwd:     t.TempDir(),
	})
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	if !waitFor(t, func() bool {
		for _, live := range manager.List() {
			if live.ID == snapshot.ID && live.Status == StatusFailed {
				return true
			}
		}
		return false
	}) {
		t.Fatalf("crash not reported: %+v", manager.List())
	}

	found := false
	for _, line := range manager.Logs(snapshot.ID) {
		if line == "boom" {
			found = true
		}
	}
	if !found {
		t.Errorf("stderr not captured: %v", manager.Logs(snapshot.ID))
	}
}

func TestStartRejectsIncompleteSpec(t *testing.T) {
	manager := NewManager()
	defer manager.StopAll()

	if _, err := manager.Start(Spec{Cwd: t.TempDir()}); err == nil {
		t.Error("missing command accepted")
	}
	if _, err := manager.Start(Spec{Command: "node"}); err == nil {
		t.Error("missing cwd accepted")
	}
}
