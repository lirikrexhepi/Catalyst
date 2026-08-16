package servers

import (
	"context"
	"testing"
)

func fakeScanner(sockets []listener, table map[int]processInfo) *Scanner {
	return &Scanner{
		listeners: func(context.Context) ([]listener, error) { return sockets, nil },
		processes: func(context.Context) (map[int]processInfo, error) { return table, nil },
	}
}

// A dev server sits several levels below the agent that asked for it, so
// attribution has to walk the whole parent chain rather than check one level.
func TestAttributesServerThroughProcessChain(t *testing.T) {
	table := map[int]processInfo{
		100: {pid: 100, parent: 1, name: "claude.exe"},
		200: {pid: 200, parent: 100, name: "cmd.exe"},
		300: {pid: 300, parent: 200, name: "npm.cmd"},
		400: {pid: 400, parent: 300, name: "node.exe", command: "node vite"},
	}
	scanner := fakeScanner([]listener{{pid: 400, port: 5173, address: "0.0.0.0"}}, table)

	found, err := scanner.Scan(context.Background(), []Owner{{ThreadID: "task-1", PID: 100}})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(found) != 1 {
		t.Fatalf("expected 1 server, got %d", len(found))
	}
	if !found[0].Ours || found[0].OwnerThreadID != "task-1" {
		t.Errorf("server not attributed to its agent: %+v", found[0])
	}
}

func TestUnattributedServerStillListed(t *testing.T) {
	table := map[int]processInfo{
		500: {pid: 500, parent: 1, name: "python.exe", command: "python -m http.server"},
	}
	scanner := fakeScanner([]listener{{pid: 500, port: 8000}}, table)

	found, _ := scanner.Scan(context.Background(), nil)
	if len(found) != 1 {
		t.Fatalf("expected the server to be listed, got %d", len(found))
	}
	if found[0].Ours {
		t.Error("a server with no agent ancestor must not be marked ours")
	}
}

func TestSystemListenersAreExcluded(t *testing.T) {
	table := map[int]processInfo{
		4:   {pid: 4, parent: 0, name: "System"},
		900: {pid: 900, parent: 1, name: "svchost.exe"},
	}
	scanner := fakeScanner([]listener{{pid: 4, port: 445}, {pid: 900, port: 135}}, table)

	found, _ := scanner.Scan(context.Background(), nil)
	if len(found) != 0 {
		t.Errorf("system listeners must be excluded, got %+v", found)
	}
}

func TestOneRowPerProcess(t *testing.T) {
	// A node server binds IPv4 and IPv6; listing it twice would imply two servers.
	table := map[int]processInfo{
		400: {pid: 400, parent: 1, name: "node.exe"},
	}
	scanner := fakeScanner([]listener{
		{pid: 400, port: 3000, address: "0.0.0.0"},
		{pid: 400, port: 3000, address: "::"},
	}, table)

	found, _ := scanner.Scan(context.Background(), nil)
	if len(found) != 1 {
		t.Errorf("expected one row per process, got %d", len(found))
	}
}

func TestClassifiesRuntimesFromCommand(t *testing.T) {
	cases := []struct {
		name    string
		command string
		want    string
	}{
		{"php.exe", "php artisan serve", "php"},
		{"cmd.exe", "npm run dev", "node"},
		{"python.exe", "uvicorn app:main", "python"},
		{"ruby.exe", "rails server", "ruby"},
		{"unknown.exe", "some daemon", ""},
	}
	for _, tc := range cases {
		got := classify(processInfo{name: tc.name, command: tc.command})
		if got != tc.want {
			t.Errorf("classify(%q, %q) = %q, want %q", tc.name, tc.command, got, tc.want)
		}
	}
}

func TestGroupedPutsUnownedLast(t *testing.T) {
	found := []Server{
		{PID: 1, Port: 3000, OwnerThreadID: "task-1", Ours: true},
		{PID: 2, Port: 8000},
		{PID: 3, Port: 5173, OwnerThreadID: "task-2", Ours: true},
	}
	owners := []Owner{{ThreadID: "task-1", Title: "Feature A"}, {ThreadID: "task-2", Title: "Feature B"}}

	groups := Grouped(found, owners)
	if len(groups) != 3 {
		t.Fatalf("expected 3 groups, got %d", len(groups))
	}
	if groups[0].Title != "Feature A" || groups[1].Title != "Feature B" {
		t.Errorf("agent groups out of order: %+v", groups)
	}
	if groups[2].ThreadID != "" {
		t.Error("unattributed servers must sort last")
	}
}

func TestGroupedSkipsAgentsWithoutServers(t *testing.T) {
	groups := Grouped(
		[]Server{{PID: 1, Port: 3000, OwnerThreadID: "task-1", Ours: true}},
		[]Owner{{ThreadID: "task-1", Title: "A"}, {ThreadID: "task-2", Title: "B"}},
	)
	if len(groups) != 1 {
		t.Fatalf("an agent with no servers must not render, got %d groups", len(groups))
	}
}

func TestStopRejectsUnlistedProcess(t *testing.T) {
	table := map[int]processInfo{400: {pid: 400, parent: 1, name: "node.exe"}}
	scanner := fakeScanner([]listener{{pid: 400, port: 3000}}, table)

	// PID 4 is a system process the scan filtered out; stopping it must be refused
	// rather than passed through to the OS.
	if err := scanner.Stop(context.Background(), 4, nil); err != errNotListed {
		t.Errorf("err = %v, want errNotListed", err)
	}
}
