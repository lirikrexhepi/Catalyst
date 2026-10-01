package remote

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"composer/internal/logger"
)

var funnelPreviewPorts = []int{8443, 10000}

func (m *PreviewManager) startFunnel(port int) (*previewTunnel, bool) {
	base := ""
	if m.funnelBase != nil {
		base = strings.TrimRight(m.funnelBase(), "/")
	}
	if !strings.HasSuffix(base, ".ts.net") {
		return nil, false
	}
	https := m.claimFunnelPort()
	if https == 0 {
		return nil, false
	}

	target, stopProxy, err := startPreviewProxy(port)
	if err != nil {
		m.releaseFunnelPort(https)
		return nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tailscale", "funnel", "--bg", fmt.Sprintf("--https=%d", https), target)
	setSysProcAttr(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		logger.Warnf("Preview", "Tailscale Funnel for localhost:%d failed, using Cloudflare: %s", port, strings.TrimSpace(string(out)))
		stopProxy()
		m.releaseFunnelPort(https)
		return nil, false
	}

	link := fmt.Sprintf("%s:%d", base, https)
	closeFunnel := func() {
		funnelOff(https)
		stopProxy()
		m.releaseFunnelPort(https)
	}
	for i := 0; i < 6 && !tunnelAnswers(link); i++ {
		if i == 5 {
			logger.Warnf("Preview", "Tailscale Funnel for localhost:%d is not answering, using Cloudflare", port)
			closeFunnel()
			return nil, false
		}
		time.Sleep(300 * time.Millisecond)
	}

	return &previewTunnel{
		url:       link,
		state:     PreviewLive,
		startedAt: time.Now().UnixMilli(),
		closeFn:   closeFunnel,
	}, true
}

func (m *PreviewManager) claimFunnelPort() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, p := range funnelPreviewPorts {
		if !m.funnelInUse[p] {
			m.funnelInUse[p] = true
			return p
		}
	}
	return 0
}

func (m *PreviewManager) releaseFunnelPort(p int) {
	m.mu.Lock()
	delete(m.funnelInUse, p)
	m.mu.Unlock()
}

func funnelOff(https int) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tailscale", "funnel", fmt.Sprintf("--https=%d", https), "off")
	setSysProcAttr(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		logger.Warnf("Preview", "Could not turn off Tailscale Funnel on %d: %s", https, strings.TrimSpace(string(out)))
	}
}
