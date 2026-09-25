package remote

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"composer/internal/logger"
)

type PreviewState string

const (
	PreviewStarting PreviewState = "starting"
	PreviewLive     PreviewState = "live"
	PreviewFailed   PreviewState = "failed"
)

type PreviewInfo struct {
	Port      int          `json:"port"`
	URL       string       `json:"url,omitempty"`
	State     PreviewState `json:"state"`
	Error     string       `json:"error,omitempty"`
	StartedAt int64        `json:"startedAt,omitempty"`
}

type previewTunnel struct {
	cmd       *exec.Cmd
	url       string
	state     PreviewState
	errMsg    string
	startedAt int64
}

var quickTunnelURL = regexp.MustCompile(`https://[A-Za-z0-9-]+\.trycloudflare\.com`)

// PreviewManager exposes localhost dev servers on public HTTPS URLs through
// Cloudflare quick tunnels, one tunnel process per port. The phone opens the
// URL in its own browser, so the site keeps its root path and every asset
// loads exactly as it does on the desktop preview.
type PreviewManager struct {
	mu      sync.Mutex
	tunnels map[int]*previewTunnel
	ownPort int
}

func NewPreviewManager(ownPort int) *PreviewManager {
	return &PreviewManager{tunnels: make(map[int]*previewTunnel), ownPort: ownPort}
}

func (m *PreviewManager) Snapshot() []PreviewInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]PreviewInfo, 0, len(m.tunnels))
	for port, t := range m.tunnels {
		out = append(out, PreviewInfo{Port: port, URL: t.url, State: t.state, Error: t.errMsg, StartedAt: t.startedAt})
	}
	return out
}

// Start launches a quick tunnel for a localhost port. It returns immediately
// with state "starting"; the caller polls Snapshot until the URL appears.
func (m *PreviewManager) Start(port int) (PreviewInfo, error) {
	if port <= 0 || port > 65535 {
		return PreviewInfo{}, fmt.Errorf("invalid port %d", port)
	}
	if port == m.ownPort {
		return PreviewInfo{}, fmt.Errorf("port %d is the remote gateway itself", port)
	}
	if !listening(port) {
		return PreviewInfo{}, fmt.Errorf("nothing is listening on localhost:%d — ask the agent to start the dev server first", port)
	}

	m.mu.Lock()
	if t, ok := m.tunnels[port]; ok && (t.state == PreviewLive || t.state == PreviewStarting) {
		info := PreviewInfo{Port: port, URL: t.url, State: t.state, Error: t.errMsg, StartedAt: t.startedAt}
		m.mu.Unlock()
		return info, nil
	}
	// A failed attempt is replaced rather than reported again.
	if t, ok := m.tunnels[port]; ok && t.cmd != nil && t.cmd.Process != nil {
		_ = t.cmd.Process.Kill()
	}
	delete(m.tunnels, port)
	m.mu.Unlock()

	bin, err := resolveBinary()
	if err != nil {
		return PreviewInfo{}, err
	}

	// --http-host-header rewrites Host to localhost so Vite/Next host checks
	// pass; without it dev servers reject the trycloudflare hostname.
	cmd := exec.Command(bin, "tunnel", "--url", fmt.Sprintf("http://127.0.0.1:%d", port),
		"--http-host-header", fmt.Sprintf("localhost:%d", port), "--no-autoupdate")
	setSysProcAttr(cmd)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return PreviewInfo{}, fmt.Errorf("could not start tunnel: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return PreviewInfo{}, fmt.Errorf("could not start tunnel: %w", err)
	}

	t := &previewTunnel{cmd: cmd, state: PreviewStarting, startedAt: time.Now().UnixMilli()}
	m.mu.Lock()
	m.tunnels[port] = t
	m.mu.Unlock()

	go m.watch(port, t, stderr)
	logger.Infof("Preview", "Quick tunnel starting for localhost:%d", port)
	return PreviewInfo{Port: port, State: PreviewStarting, StartedAt: t.startedAt}, nil
}

// watch waits until the tunnel can really carry traffic, then supervises it.
//
// cloudflared prints the trycloudflare URL before the edge can route it; a
// phone that opens it at that moment gets a DNS or 530 error and iOS caches
// the failure. So a preview only turns live once cloudflared has registered
// a connection and the public URL has answered at least once from here.
func (m *PreviewManager) watch(port int, t *previewTunnel, stderr io.Reader) {
	urlCh := make(chan string, 1)
	readyCh := make(chan struct{}, 1)
	exited := make(chan string, 1)

	go func() {
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 64*1024), 64*1024)
		last := ""
		for scanner.Scan() {
			line := scanner.Text()
			if url := quickTunnelURL.FindString(line); url != "" {
				select {
				case urlCh <- url:
				default:
				}
			}
			if strings.Contains(line, "Registered tunnel connection") {
				select {
				case readyCh <- struct{}{}:
				default:
				}
			}
			if strings.TrimSpace(line) != "" {
				last = line
			}
		}
		_ = t.cmd.Wait()
		exited <- last
	}()

	url, ready := "", false
	deadline := time.After(90 * time.Second)
	// The log line is the fast signal; the public URL answering is accepted
	// too, in case a cloudflared release words its log differently.
	probe := time.NewTicker(3 * time.Second)
	defer probe.Stop()
	for url == "" || !ready {
		select {
		case url = <-urlCh:
		case <-readyCh:
			ready = true
		case <-probe.C:
			if url != "" && tunnelAnswers(url) {
				ready = true
			}
		case last := <-exited:
			msg := "tunnel exited before publishing a URL"
			if last != "" {
				msg = last
			}
			m.fail(port, t, msg)
			return
		case <-deadline:
			m.fail(port, t, "timed out waiting for Cloudflare to publish the link")
			_ = t.cmd.Process.Kill()
			return
		}
	}

	// Give the edge a moment to route the new hostname before handing it out.
	for i := 0; i < 10 && !tunnelAnswers(url); i++ {
		time.Sleep(2 * time.Second)
	}

	m.mu.Lock()
	if m.tunnels[port] == t {
		t.url = url
		t.state = PreviewLive
		t.errMsg = ""
	}
	m.mu.Unlock()
	logger.Infof("Preview", "localhost:%d is live at %s", port, url)

	m.supervise(port, t, url, exited)
}

// supervise keeps a live preview honest. A tunnel whose process died, or whose
// edge stopped answering, is replaced with a fresh one; a preview whose dev
// server stopped listening is removed. Without this the phone kept offering a
// dead link until someone stopped it by hand.
func (m *PreviewManager) supervise(port int, t *previewTunnel, url string, exited <-chan string) {
	ticker := time.NewTicker(previewHealthInterval)
	defer ticker.Stop()
	failures := 0
	for {
		select {
		case <-exited:
			if m.drop(port, t) {
				logger.Warnf("Preview", "Tunnel for localhost:%d exited; restarting", port)
				m.restartIfListening(port)
			}
			return
		case <-ticker.C:
			if !m.owns(port, t) {
				return
			}
			if !listening(port) {
				logger.Infof("Preview", "localhost:%d stopped listening; closing its preview", port)
				m.stopIf(port, t)
				return
			}
			if tunnelAnswers(url) {
				failures = 0
				continue
			}
			failures++
			if failures >= 3 {
				logger.Warnf("Preview", "Tunnel for localhost:%d stopped answering; replacing it", port)
				m.stopIf(port, t)
				m.restartIfListening(port)
				return
			}
		}
	}
}

const previewHealthInterval = 30 * time.Second

func (m *PreviewManager) restartIfListening(port int) {
	if !listening(port) {
		return
	}
	if _, err := m.Start(port); err != nil {
		logger.Errorf("Preview", "Could not restart tunnel for localhost:%d: %v", port, err)
	}
}

func (m *PreviewManager) owns(port int, t *previewTunnel) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.tunnels[port] == t
}

// drop forgets the tunnel if it is still the one registered for the port.
func (m *PreviewManager) drop(port int, t *previewTunnel) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.tunnels[port] != t {
		return false
	}
	delete(m.tunnels, port)
	return true
}

func (m *PreviewManager) stopIf(port int, t *previewTunnel) {
	if m.drop(port, t) && t.cmd != nil && t.cmd.Process != nil {
		_ = t.cmd.Process.Kill()
	}
}

func (m *PreviewManager) fail(port int, t *previewTunnel, msg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.tunnels[port] == t {
		t.state = PreviewFailed
		t.errMsg = msg
	}
	logger.Errorf("Preview", "Tunnel for localhost:%d failed: %s", port, msg)
}

func listening(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 2*time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// tunnelAnswers reports whether the public URL reaches the dev server. Any
// response from the site counts, errors included; only Cloudflare's own
// tunnel errors (530, the 1033 page) and network failures mean it is down.
var previewProbe = &http.Client{
	Timeout: 8 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func tunnelAnswers(url string) bool {
	resp, err := previewProbe.Get(url)
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return resp.StatusCode != 530
}

func (m *PreviewManager) Stop(port int) {
	m.mu.Lock()
	t, ok := m.tunnels[port]
	if ok {
		delete(m.tunnels, port)
	}
	m.mu.Unlock()
	if ok && t.cmd != nil && t.cmd.Process != nil {
		_ = t.cmd.Process.Kill()
	}
}

func (m *PreviewManager) StopAll() {
	m.mu.Lock()
	tunnels := m.tunnels
	m.tunnels = make(map[int]*previewTunnel)
	m.mu.Unlock()
	for _, t := range tunnels {
		if t.cmd != nil && t.cmd.Process != nil {
			_ = t.cmd.Process.Kill()
		}
	}
}

// resolveBinary finds cloudflared on PATH. It never downloads anything: on
// managed machines nothing gets installed without the owner's say-so.
func resolveBinary() (string, error) {
	if bin, err := exec.LookPath("cloudflared"); err == nil {
		return bin, nil
	}
	return "", previewMissingError()
}

func previewMissingError() error {
	return fmt.Errorf("cloudflared is not installed on this PC — install it yourself first: winget install cloudflare.cloudflared (Windows) or https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
}
