package remote

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"composer/internal/logger"
)

type TunnelManager struct {
	mu           sync.RWMutex
	port         int
	publicURL    string
	tailscaleURL string
	cmd          *exec.Cmd
	cancel       context.CancelFunc
	downloading  bool
	connecting   bool
	lastError    string
}

func NewTunnelManager(port int) *TunnelManager {
	return &TunnelManager{port: port}
}

// ensureCloudflared checks for an existing cloudflared binary or downloads it automatically.
func (tm *TunnelManager) ensureCloudflared(ctx context.Context) string {
	if p, err := exec.LookPath("cloudflared"); err == nil {
		return p
	}

	userProfile := os.Getenv("USERPROFILE")
	localApp := os.Getenv("LOCALAPPDATA")
	if localApp == "" && userProfile != "" {
		localApp = filepath.Join(userProfile, "AppData", "Local")
	}

	candidates := []string{
		filepath.Join(localApp, "cloudflared", "cloudflared.exe"),
		filepath.Join(userProfile, "bin", "cloudflared.exe"),
		`C:\Program Files\cloudflared\cloudflared.exe`,
		`C:\Program Files (x86)\cloudflared\cloudflared.exe`,
	}
	for _, cand := range candidates {
		if cand != "" {
			if info, statErr := os.Stat(cand); statErr == nil && !info.IsDir() {
				logger.Infof("RemoteTunnel", "Found cloudflared at %s", cand)
				return cand
			}
		}
	}

	if localApp == "" {
		return ""
	}

	targetDir := filepath.Join(localApp, "cloudflared")
	_ = os.MkdirAll(targetDir, 0755)
	dest := filepath.Join(targetDir, "cloudflared.exe")

	tm.mu.Lock()
	tm.downloading = true
	tm.mu.Unlock()
	defer func() {
		tm.mu.Lock()
		tm.downloading = false
		tm.mu.Unlock()
	}()

	logger.Infof("RemoteTunnel", "Downloading cloudflared for worldwide remote access...")
	dlURL := "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
	req, err := http.NewRequestWithContext(ctx, "GET", dlURL, nil)
	if err != nil {
		tm.mu.Lock()
		tm.lastError = err.Error()
		tm.mu.Unlock()
		return ""
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		logger.Errorf("RemoteTunnel", "Failed to download cloudflared: %v", err)
		tm.mu.Lock()
		tm.lastError = err.Error()
		tm.mu.Unlock()
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errStr := fmt.Sprintf("Download returned HTTP %d", resp.StatusCode)
		logger.Errorf("RemoteTunnel", "%s", errStr)
		tm.mu.Lock()
		tm.lastError = errStr
		tm.mu.Unlock()
		return ""
	}

	tmpDest := dest + ".part"
	out, err := os.Create(tmpDest)
	if err != nil {
		return ""
	}
	if _, err := io.Copy(out, resp.Body); err != nil {
		_ = out.Close()
		_ = os.Remove(tmpDest)
		return ""
	}
	_ = out.Close()
	_ = os.Rename(tmpDest, dest)

	logger.Infof("RemoteTunnel", "cloudflared successfully provisioned: %s", dest)
	return dest
}

// StartCloudflareTunnel starts a secure public tunnel via Cloudflare Quick Tunnels.
// This allows immediate remote access from university or cellular mobile data
// without opening router ports or requiring the same Wi-Fi.
func (tm *TunnelManager) StartCloudflareTunnel(ctx context.Context) {
	tm.mu.Lock()
	tm.connecting = true
	tm.lastError = ""
	tm.mu.Unlock()

	cloudflaredPath := tm.ensureCloudflared(ctx)
	if cloudflaredPath == "" {
		tm.mu.Lock()
		tm.connecting = false
		tm.lastError = "Could not locate or download cloudflared"
		tm.mu.Unlock()
		return
	}

	tunnelCtx, cancel := context.WithCancel(ctx)
	tm.mu.Lock()
	tm.cancel = cancel
	cmd := exec.CommandContext(tunnelCtx, cloudflaredPath, "tunnel", "--url", fmt.Sprintf("http://127.0.0.1:%d", tm.port))
	setSysProcAttr(cmd)
	tm.cmd = cmd
	tm.mu.Unlock()

	cmd.Stdout = io.Discard
	stderr, err := cmd.StderrPipe()
	if err != nil {
		tm.mu.Lock()
		tm.connecting = false
		tm.lastError = err.Error()
		tm.mu.Unlock()
		return
	}

	if err := cmd.Start(); err != nil {
		logger.Errorf("RemoteTunnel", "Failed to start cloudflared: %v", err)
		tm.mu.Lock()
		tm.connecting = false
		tm.lastError = err.Error()
		tm.mu.Unlock()
		return
	}

	logger.Infof("RemoteTunnel", "cloudflared process started (PID=%d)", cmd.Process.Pid)

	go func() {
		scanner := bufio.NewScanner(stderr)
		urlRegex := regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)
		for scanner.Scan() {
			line := scanner.Text()
			tm.mu.RLock()
			alreadySet := tm.publicURL != ""
			tm.mu.RUnlock()

			if !alreadySet {
				if match := urlRegex.FindString(line); match != "" {
					tm.mu.Lock()
					tm.publicURL = match
					tm.connecting = false
					tm.mu.Unlock()
					logger.Infof("RemoteTunnel", "Cloudflare worldwide public tunnel established: %s", match)
				}
			}
		}
		_ = cmd.Wait()
		tm.mu.Lock()
		if tm.publicURL == "" {
			tm.connecting = false
			if tm.lastError == "" {
				tm.lastError = "Cloudflare tunnel exited before connection was established"
			}
			logger.Errorf("RemoteTunnel", "%s", tm.lastError)
		}
		tm.mu.Unlock()
	}()
}

func (tm *TunnelManager) Stop() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if tm.cancel != nil {
		tm.cancel()
	}
	if tm.cmd != nil && tm.cmd.Process != nil {
		_ = tm.cmd.Process.Kill()
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

	if tm.publicURL != "" {
		best = public
	} else if tm.tailscaleURL != "" {
		best = withToken(tm.tailscaleURL)
	}

	return public, best, tm.connecting, tm.downloading, tm.lastError
}
