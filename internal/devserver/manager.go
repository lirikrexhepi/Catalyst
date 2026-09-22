package devserver

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"composer/internal/process"
	"composer/internal/shell"
)

const (
	logLimit      = 500
	shutdownGrace = 3 * time.Second
)

type Status string

const (
	StatusRunning Status = "running"
	StatusExited  Status = "exited"
	StatusFailed  Status = "failed"
)

type Spec struct {
	Label         string            `json:"label,omitempty"`
	Command       string            `json:"command"`
	Args          []string          `json:"args,omitempty"`
	Cwd           string            `json:"cwd"`
	Env           map[string]string `json:"env,omitempty"`
	OwnerThreadID string            `json:"ownerThreadId,omitempty"`
}

type Snapshot struct {
	ID            string `json:"id"`
	Label         string `json:"label"`
	Command       string `json:"command"`
	Cwd           string `json:"cwd"`
	PID           int    `json:"pid"`
	Port          int    `json:"port,omitempty"`
	URL           string `json:"url,omitempty"`
	Status        Status `json:"status"`
	ExitCode      *int   `json:"exitCode,omitempty"`
	OwnerThreadID string `json:"ownerThreadId,omitempty"`
	StartedAt     int64  `json:"startedAt"`
	Managed       bool   `json:"managed"`
}

type server struct {
	mu       sync.Mutex
	id       string
	spec     Spec
	proc     *process.Process
	pid      int
	port     int
	status   Status
	exitCode *int
	started  int64
	logs     []string
	onPort   func(int)
}

type Manager struct {
	mu      sync.RWMutex
	servers map[string]*server
	order   []string
	seq     atomic.Uint64

	ctx    context.Context
	cancel context.CancelFunc

	onChange func()
}

func NewManager() *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{servers: make(map[string]*server), ctx: ctx, cancel: cancel}
}

func (m *Manager) OnChange(fn func()) { m.onChange = fn }

func (m *Manager) notify() {
	if m.onChange != nil {
		m.onChange()
	}
}

func (m *Manager) Start(spec Spec) (Snapshot, error) {
	if strings.TrimSpace(spec.Command) == "" {
		return Snapshot{}, fmt.Errorf("command is required")
	}
	if strings.TrimSpace(spec.Cwd) == "" {
		return Snapshot{}, fmt.Errorf("cwd is required")
	}

	id := "srv-" + strconv.FormatUint(m.seq.Add(1), 36)
	s := &server{
		id:      id,
		spec:    spec,
		status:  StatusRunning,
		started: time.Now().UnixMilli(),
		onPort: func(port int) {
			m.notify()
		},
	}

	proc, err := process.Start(m.ctx, process.Spec{
		Command:  spec.Command,
		Args:     spec.Args,
		Cwd:      spec.Cwd,
		Env:      shell.Merge(shell.BaseEnvironment(), spec.Env),
		Stderr:   func(line string) { s.appendLog(line) },
		KillTree: true,
	})
	if err != nil {
		return Snapshot{}, fmt.Errorf("start %s: %w", spec.Command, err)
	}

	s.mu.Lock()
	s.proc = proc
	s.pid = proc.PID()
	s.mu.Unlock()

	m.mu.Lock()
	m.servers[id] = s
	m.order = append(m.order, id)
	m.mu.Unlock()

	go s.pumpStdout(proc.Stdout())
	go m.reap(s, proc)

	m.notify()
	return s.snapshot(), nil
}

func (m *Manager) reap(s *server, proc *process.Process) {
	<-proc.Done()

	s.mu.Lock()
	if s.status == StatusRunning {
		s.status = StatusExited
		if err := proc.ExitError(); err != nil {
			s.status = StatusFailed
		}
	}
	if code, ok := exitCode(proc); ok {
		s.exitCode = &code
	}
	s.mu.Unlock()

	m.notify()
}

func (m *Manager) Stop(id string) error {
	m.mu.RLock()
	s, ok := m.servers[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("no server %s", id)
	}

	s.mu.Lock()
	proc := s.proc
	s.status = StatusExited
	s.mu.Unlock()

	if proc != nil {
		_ = proc.Shutdown(shutdownGrace)
	}
	m.notify()
	return nil
}

func (m *Manager) Forget(id string) error {
	if err := m.Stop(id); err != nil {
		return err
	}
	m.mu.Lock()
	delete(m.servers, id)
	for i, candidate := range m.order {
		if candidate == id {
			m.order = append(m.order[:i], m.order[i+1:]...)
			break
		}
	}
	m.mu.Unlock()
	m.notify()
	return nil
}

func (m *Manager) List() []Snapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]Snapshot, 0, len(m.order))
	for _, id := range m.order {
		if s, ok := m.servers[id]; ok {
			out = append(out, s.snapshot())
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StartedAt < out[j].StartedAt })
	return out
}

func (m *Manager) Logs(id string) []string {
	m.mu.RLock()
	s, ok := m.servers[id]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.logs...)
}

func (m *Manager) PIDs() map[int]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make(map[int]string, len(m.servers))
	for id, s := range m.servers {
		s.mu.Lock()
		if s.status == StatusRunning && s.pid > 0 {
			out[s.pid] = id
		}
		s.mu.Unlock()
	}
	return out
}

func (m *Manager) SetPort(id string, port int) {
	if port <= 0 {
		return
	}
	m.mu.RLock()
	s, ok := m.servers[id]
	m.mu.RUnlock()
	if !ok {
		return
	}
	s.mu.Lock()
	changed := s.port != port
	s.port = port
	s.mu.Unlock()
	if changed {
		m.notify()
	}
}

func (m *Manager) StopAll() {
	m.mu.RLock()
	live := make([]*server, 0, len(m.servers))
	for _, s := range m.servers {
		live = append(live, s)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	for _, s := range live {
		s.mu.Lock()
		proc := s.proc
		s.status = StatusExited
		s.mu.Unlock()
		if proc == nil {
			continue
		}
		wg.Add(1)
		go func(p *process.Process) {
			defer wg.Done()
			_ = p.Shutdown(shutdownGrace)
		}(proc)
	}
	wg.Wait()

	m.cancel()
	m.notify()
}

func (s *server) snapshot() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()

	label := s.spec.Label
	if label == "" {
		label = commandLine(s.spec)
	}
	snapshot := Snapshot{
		ID:            s.id,
		Label:         label,
		Command:       commandLine(s.spec),
		Cwd:           s.spec.Cwd,
		PID:           s.pid,
		Port:          s.port,
		Status:        s.status,
		ExitCode:      s.exitCode,
		OwnerThreadID: s.spec.OwnerThreadID,
		StartedAt:     s.started,
		Managed:       true,
	}
	if s.port > 0 {
		snapshot.URL = fmt.Sprintf("http://localhost:%d", s.port)
	}
	return snapshot
}

func commandLine(spec Spec) string {
	if len(spec.Args) == 0 {
		return spec.Command
	}
	return spec.Command + " " + strings.Join(spec.Args, " ")
}

func (s *server) pumpStdout(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		s.appendLog(scanner.Text())
	}
}

func (s *server) appendLog(line string) {
	var detectedPort int
	s.mu.Lock()
	s.logs = append(s.logs, line)
	if len(s.logs) > logLimit {
		s.logs = s.logs[len(s.logs)-logLimit:]
	}
	if s.port == 0 {
		if port, ok := detectPort(line); ok {
			s.port = port
			detectedPort = port
		}
	}
	onPort := s.onPort
	s.mu.Unlock()

	if detectedPort > 0 && onPort != nil {
		onPort(detectedPort)
	}
}

var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

var portPattern = regexp.MustCompile(`(?i)(?:https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[^\s/:]+):(\d{2,5}))|(?:\b(?:listen(?:ing)?|ready|started)(?:\s+on)?(?:\s+port)?\s*:?\s*(\d{2,5})\b)|(?:\bport\s*:?\s*(\d{2,5})\b)`)

func detectPort(line string) (int, bool) {
	clean := ansiPattern.ReplaceAllString(line, "")
	match := portPattern.FindStringSubmatch(clean)
	if match == nil {
		return 0, false
	}
	for _, group := range match[1:] {
		if group == "" {
			continue
		}
		port, err := strconv.Atoi(group)
		if err != nil || port <= 0 || port > 65535 {
			continue
		}
		return port, true
	}
	return 0, false
}

func exitCode(proc *process.Process) (int, bool) {
	err := proc.ExitError()
	if err == nil {
		return 0, true
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), true
	}
	return 0, false
}
