package servers

import (
	"context"
	"errors"
	"sort"
	"strings"
)

// errNotListed guards the stop path: only a process the current scan surfaced
// may be terminated, so a stale panel cannot target an unrelated PID that has
// since reused the number.
var errNotListed = errors.New("that process is no longer a listed server")

// Server is one listening process discovered on the machine.
type Server struct {
	PID     int    `json:"pid"`
	Port    int    `json:"port"`
	Address string `json:"address"`
	Name    string `json:"name"`
	Command string `json:"command"`
	// Kind is the runtime family (node, python, php, go...), used for grouping
	// and iconography rather than anything behavioural.
	Kind string `json:"kind"`
	// OwnerThreadID is the agent session whose process tree contains this
	// listener. Empty when it was not started by an agent.
	OwnerThreadID string `json:"ownerThreadId,omitempty"`
	// Ours marks a listener Catalyst can attribute to one of its own agents.
	Ours bool `json:"ours"`
	// Agent marks the agent CLI's own socket rather than something it started.
	// Not a web server, so it is never a preview destination.
	Agent bool `json:"agent,omitempty"`
}

// Owner identifies an agent whose spawned processes should be attributed.
//
// PID is the agent CLI's own process. Servers are attributed by walking a
// listener's parent chain until one of these is reached, which is what ties a
// dev server several levels deep (agent → shell → npm → node) back to the agent
// that asked for it.
type Owner struct {
	ThreadID string `json:"threadId"`
	Title    string `json:"title"`
	PID      int    `json:"pid"`
}

// Group is the panel's unit: one agent and the servers it started. Servers with
// no agent ancestor land in a group with an empty ThreadID.
type Group struct {
	ThreadID string   `json:"threadId,omitempty"`
	Title    string   `json:"title"`
	Servers  []Server `json:"servers"`
}

// Grouped folds a scan into per-agent buckets, agents first and unattributed
// servers last.
func Grouped(found []Server, owners []Owner) []Group {
	titles := make(map[string]string, len(owners))
	order := make([]string, 0, len(owners))
	for _, owner := range owners {
		if _, seen := titles[owner.ThreadID]; !seen {
			titles[owner.ThreadID] = owner.Title
			order = append(order, owner.ThreadID)
		}
	}

	byThread := make(map[string][]Server)
	for _, server := range found {
		byThread[server.OwnerThreadID] = append(byThread[server.OwnerThreadID], server)
	}

	groups := make([]Group, 0, len(order)+1)
	for _, threadID := range order {
		servers := byThread[threadID]
		if len(servers) == 0 {
			continue
		}
		groups = append(groups, Group{ThreadID: threadID, Title: titles[threadID], Servers: servers})
	}
	if others := byThread[""]; len(others) > 0 {
		groups = append(groups, Group{Title: "Not started by an agent", Servers: others})
	}
	return groups
}

// Scanner enumerates listening sockets and maps them back to the agent that
// started them.
type Scanner struct {
	listeners func(context.Context) ([]listener, error)
	processes func(context.Context) (map[int]processInfo, error)
}

func NewScanner() *Scanner {
	return &Scanner{listeners: listeningSockets, processes: processTable}
}

// Stop terminates a listening process. Refuses PIDs the scan did not report as
// stoppable, so a stale UI cannot be used to kill an arbitrary process.
func (s *Scanner) Stop(ctx context.Context, pid int, owners []Owner) error {
	found, err := s.Scan(ctx, owners)
	if err != nil {
		return err
	}
	for _, server := range found {
		if server.PID == pid {
			return stop(ctx, pid)
		}
	}
	return errNotListed
}

type listener struct {
	pid     int
	port    int
	address string
}

type processInfo struct {
	pid     int
	parent  int
	name    string
	command string
}

// Scan returns every listening server, attributing each to an owning agent when
// its process tree leads back to one.
//
// Attribution walks parents rather than matching on port or name: a dev server
// is usually several levels below the agent (agent → shell → npm → node), and
// only the tree reliably ties them together.
func (s *Scanner) Scan(ctx context.Context, owners []Owner) ([]Server, error) {
	sockets, err := s.listeners(ctx)
	if err != nil {
		return nil, err
	}
	table, err := s.processes(ctx)
	if err != nil {
		return nil, err
	}

	ownerByPID := make(map[int]Owner, len(owners))
	for _, owner := range owners {
		if owner.PID > 0 {
			ownerByPID[owner.PID] = owner
		}
	}

	seen := make(map[int]bool)
	out := make([]Server, 0, len(sockets))
	for _, socket := range sockets {
		// One process can hold several sockets (IPv4 + IPv6, or many ports);
		// the panel lists a process once, on its lowest port.
		if seen[socket.pid] {
			continue
		}

		info, ok := table[socket.pid]
		if !ok || isSystemProcess(info) {
			continue
		}

		owner, owned := findOwner(info.pid, table, ownerByPID)
		server := Server{
			PID:     info.pid,
			Port:    socket.port,
			Address: socket.address,
			Name:    info.name,
			Command: info.command,
			Kind:    classify(info),
			Ours:    owned,
		}
		if owned {
			server.OwnerThreadID = owner.ThreadID
			// The agent CLI holds its own socket for internal IPC. It is owned by
			// definition — it *is* the owner — but it serves no page, so anything
			// offering these as previewable destinations must be able to skip it.
			server.Agent = ownerByPID[info.pid].PID == info.pid
		}
		if server.Kind == "" && !owned {
			// Unclassifiable and not ours: almost certainly a system service the
			// user has no interest in stopping from here.
			continue
		}

		seen[socket.pid] = true
		out = append(out, server)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Ours != out[j].Ours {
			return out[i].Ours
		}
		return out[i].Port < out[j].Port
	})
	return out, nil
}

// findOwner walks up the parent chain looking for a known agent process.
func findOwner(pid int, table map[int]processInfo, owners map[int]Owner) (Owner, bool) {
	const maxDepth = 24
	for depth := 0; depth < maxDepth && pid > 0; depth++ {
		if owner, ok := owners[pid]; ok {
			return owner, true
		}
		info, ok := table[pid]
		if !ok || info.parent == pid {
			break
		}
		pid = info.parent
	}
	return Owner{}, false
}

// runtimes maps executable names onto the stack a user would recognise.
var runtimes = map[string]string{
	"node":        "node",
	"node.exe":    "node",
	"deno":        "deno",
	"deno.exe":    "deno",
	"bun":         "bun",
	"bun.exe":     "bun",
	"python":      "python",
	"python.exe":  "python",
	"python3":     "python",
	"pythonw.exe": "python",
	"php":         "php",
	"php.exe":     "php",
	"ruby":        "ruby",
	"ruby.exe":    "ruby",
	"java":        "java",
	"java.exe":    "java",
	"dotnet":      "dotnet",
	"dotnet.exe":  "dotnet",
	"go":          "go",
	"go.exe":      "go",
	"cargo":       "rust",
	"cargo.exe":   "rust",
	"caddy":       "caddy",
	"nginx":       "nginx",
	"nginx.exe":   "nginx",
}

// commandHints catch runtimes invoked through a launcher, where the executable
// name alone says nothing useful ("php artisan serve", "python -m http.server").
var commandHints = []struct {
	needle string
	kind   string
}{
	{"artisan serve", "php"},
	{"vite", "node"},
	{"next dev", "node"},
	{"next start", "node"},
	{"nodemon", "node"},
	{"webpack", "node"},
	{"ng serve", "node"},
	{"npm run", "node"},
	{"pnpm", "node"},
	{"yarn", "node"},
	{"http.server", "python"},
	{"manage.py runserver", "python"},
	{"uvicorn", "python"},
	{"gunicorn", "python"},
	{"flask run", "python"},
	{"rails server", "ruby"},
	{"spring-boot", "java"},
	{"air", "go"},
}

func classify(info processInfo) string {
	name := strings.ToLower(info.name)
	if kind, ok := runtimes[name]; ok {
		return kind
	}

	command := strings.ToLower(info.command)
	for _, hint := range commandHints {
		if strings.Contains(command, hint.needle) {
			return hint.kind
		}
	}
	return ""
}

// systemProcesses are never actionable from this panel; offering to kill them
// invites a user to break their own machine.
var systemProcesses = map[string]bool{
	"system":       true,
	"svchost.exe":  true,
	"services.exe": true,
	"lsass.exe":    true,
	"wininit.exe":  true,
	"csrss.exe":    true,
	"smss.exe":     true,
	"spoolsv.exe":  true,
	"idle":         true,
}

func isSystemProcess(info processInfo) bool {
	return systemProcesses[strings.ToLower(info.name)] || info.pid <= 4
}
