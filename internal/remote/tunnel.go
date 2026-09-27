package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"composer/internal/logger"
)

type TunnelManager struct {
	mu         sync.RWMutex
	port       int
	publicURL  string
	connecting bool
	lastError  string
	// stop ends a KeepPublicTunnel retry loop; replaced on every start.
	stop chan struct{}
}

func NewTunnelManager(port int) *TunnelManager {
	return &TunnelManager{port: port}
}

var funnelURLRegex = regexp.MustCompile(`https://[A-Za-z0-9.-]+\.ts\.net`)

// StartPublicTunnel publishes the remote server through Tailscale Funnel.
// The Funnel URL is stable across restarts, unlike ephemeral quick tunnels.
// It is started automatically with the remote server and torn down on Stop.
func (tm *TunnelManager) StartPublicTunnel(ctx context.Context) {
	tm.mu.Lock()
	tm.connecting = true
	tm.lastError = ""
	tm.mu.Unlock()

	if _, err := exec.LookPath("tailscale"); err != nil {
		tm.mu.Lock()
		tm.connecting = false
		tm.lastError = "Tailscale is not installed. Install it from tailscale.com/download, sign in, then retry."
		tm.mu.Unlock()
		return
	}

	target := fmt.Sprintf("http://127.0.0.1:%d", tm.port)

	if url := funnelStatusURL(ctx, target); url != "" {
		tm.mu.Lock()
		tm.publicURL = url
		tm.connecting = false
		tm.mu.Unlock()
		logger.Infof("RemoteTunnel", "Tailscale Funnel already serving: %s", url)
		return
	}

	runCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	funnelCmd := exec.CommandContext(runCtx, "tailscale", "funnel", "--bg", target)
	setSysProcAttr(funnelCmd)
	out, err := funnelCmd.CombinedOutput()
	output := string(out)
	if err != nil {
		msg := funnelFailure(strings.TrimSpace(output), target)
		if msg == "" {
			msg = err.Error()
		}
		tm.mu.Lock()
		tm.connecting = false
		tm.lastError = msg
		tm.mu.Unlock()
		logger.Errorf("RemoteTunnel", "Failed to start Tailscale Funnel: %s", msg)
		return
	}

	if match := funnelURLRegex.FindString(output); match != "" {
		tm.mu.Lock()
		tm.publicURL = match
		tm.connecting = false
		tm.mu.Unlock()
		logger.Infof("RemoteTunnel", "Tailscale Funnel established: %s", match)
		return
	}

	if url := funnelStatusURL(ctx, target); url != "" {
		tm.mu.Lock()
		tm.publicURL = url
		tm.connecting = false
		tm.mu.Unlock()
		logger.Infof("RemoteTunnel", "Tailscale Funnel established: %s", url)
		return
	}

	tm.mu.Lock()
	tm.connecting = false
	tm.lastError = "Tailscale Funnel started but no public URL was found"
	tm.mu.Unlock()
}

var tailscaleStateRegex = regexp.MustCompile(`unexpected state: (\w+)`)

func funnelFailure(output, target string) string {
	if strings.Contains(output, "Funnel is not enabled") {
		return "Funnel is not enabled on your tailnet. Run: tailscale funnel --bg " + target + " once in PowerShell after approving it in the Tailscale admin console."
	}
	state := ""
	if m := tailscaleStateRegex.FindStringSubmatch(output); m != nil {
		state = m[1]
	} else if strings.Contains(output, "is Tailscale running") || strings.Contains(output, "failed to connect to local tailscaled") {
		state = "NoState"
	}
	switch state {
	case "NoState", "Starting":
		return "Tailscale isn't running on this PC yet, so your phone can't reach it. Tailscale waits for someone to sign in to Windows unless it runs unattended: open the Tailscale tray icon, Preferences, and turn on Run unattended."
	case "NeedsLogin":
		return "Tailscale is signed out on this PC, so your phone can't reach it. Sign in to Tailscale from its tray icon."
	case "NeedsMachineAuth":
		return "This PC is waiting for approval in the Tailscale admin console, so your phone can't reach it yet."
	case "Stopped":
		return "Tailscale is disconnected on this PC, so your phone can't reach it. Click Connect in the Tailscale tray icon."
	}
	return output
}

// funnelStatusURL reads `tailscale serve status --json` and returns the public
// Funnel URL whose handler proxies the given target, or "" if none.
func funnelStatusURL(ctx context.Context, target string) string {
	runCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	statusCmd := exec.CommandContext(runCtx, "tailscale", "serve", "status", "--json")
	setSysProcAttr(statusCmd)
	out, err := statusCmd.Output()
	if err != nil {
		return ""
	}
	var status struct {
		Web map[string]struct {
			Handlers map[string]struct {
				Proxy string `json:"Proxy"`
			} `json:"Handlers"`
		} `json:"Web"`
	}
	if err := json.Unmarshal(out, &status); err != nil {
		return ""
	}
	for hostport, svc := range status.Web {
		for _, h := range svc.Handlers {
			if h.Proxy == target {
				host := hostport
				if i := strings.LastIndex(host, ":"); i >= 0 {
					host = host[:i]
				}
				return "https://" + host
			}
		}
	}
	return ""
}

// KeepPublicTunnel retries StartPublicTunnel until Funnel reports a URL, the
// context ends, or Stop is called. After a remote power-on the app can start
// before Tailscale has connected, and a single attempt would leave the phone
// locked out until someone restarts the app at the PC.
func (tm *TunnelManager) KeepPublicTunnel(ctx context.Context) {
	stop := make(chan struct{})
	tm.mu.Lock()
	tm.stop = stop
	tm.mu.Unlock()

	delay := 5 * time.Second
	for {
		tm.StartPublicTunnel(ctx)
		tm.mu.RLock()
		up := tm.publicURL != ""
		tm.mu.RUnlock()
		if up {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-time.After(delay):
		}
		if delay < time.Minute {
			delay *= 2
		}
		logger.Infof("RemoteTunnel", "Retrying Tailscale Funnel")
	}
}

func (tm *TunnelManager) Stop() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if tm.stop != nil {
		close(tm.stop)
		tm.stop = nil
	}
	if tm.publicURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		offCmd := exec.CommandContext(ctx, "tailscale", "funnel", "--https=443", "off")
		setSysProcAttr(offCmd)
		_ = offCmd.Run()
	}
	tm.publicURL = ""
	tm.connecting = false
}

func (tm *TunnelManager) Status(token string) (public, best string, connecting, downloading bool, lastError string) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	withToken := func(baseURL string) string {
		if baseURL == "" {
			return ""
		}
		sep := "?"
		if strings.Contains(baseURL, "?") {
			sep = "&"
		}
		return fmt.Sprintf("%s%stoken=%s", baseURL, sep, token)
	}

	public = withToken(tm.publicURL)
	best = public

	return public, best, tm.connecting, false, tm.lastError
}
