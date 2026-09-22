package remote

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"os/exec"
	"regexp"
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
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 2*time.Second)
	if err != nil {
		return PreviewInfo{}, fmt.Errorf("nothing is listening on localhost:%d — ask the agent to start the dev server first", port)
	}
	_ = conn.Close()

	m.mu.Lock()
	if t, ok := m.tunnels[port]; ok && (t.state == PreviewLive || t.state == PreviewStarting) {
		info := PreviewInfo{Port: port, URL: t.url, State: t.state, Error: t.errMsg, StartedAt: t.startedAt}
		m.mu.Unlock()
		return info, nil
	}
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

	go m.watch(port, cmd, stderr)
	logger.Infof("Preview", "Quick tunnel starting for localhost:%d", port)
	return PreviewInfo{Port: port, State: PreviewStarting, StartedAt: t.startedAt}, nil
}

func (m *PreviewManager) watch(port int, cmd *exec.Cmd, stderr io.Reader) {
	urlCh := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 64*1024), 64*1024)
		var tail []string
		for scanner.Scan() {
			line := scanner.Text()
			if url := quickTunnelURL.FindString(line); url != "" {
				select {
				case urlCh <- url:
				default:
				}
			}
			tail = append(tail, line)
			if len(tail) > 20 {
				tail = tail[len(tail)-20:]
			}
		}
		if err := cmd.Wait(); err != nil {
			m.mu.Lock()
			if t, ok := m.tunnels[port]; ok && t.state == PreviewStarting {
				msg := "tunnel exited before publishing a URL"
				if len(tail) > 0 {
					msg = tail[len(tail)-1]
				}
				t.state = PreviewFailed
				t.errMsg = msg
			}
			m.mu.Unlock()
		}
	}()

	select {
	case url := <-urlCh:
		m.mu.Lock()
		if t, ok := m.tunnels[port]; ok {
			t.url = url
			t.state = PreviewLive
			t.errMsg = ""
		}
		m.mu.Unlock()
		logger.Infof("Preview", "localhost:%d is live at %s", port, url)
	case <-time.After(90 * time.Second):
		m.mu.Lock()
		if t, ok := m.tunnels[port]; ok && t.state == PreviewStarting {
			t.state = PreviewFailed
			t.errMsg = "timed out waiting for the public URL"
		}
		m.mu.Unlock()
		_ = cmd.Process.Kill()
	}
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
