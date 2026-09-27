package remote

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
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

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		m.releaseFunnelPort(https)
		return nil, false
	}
	proxy := &http.Server{Handler: hostRewriteProxy(port), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = proxy.Serve(listener) }()

	target := "http://" + listener.Addr().String()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tailscale", "funnel", "--bg", fmt.Sprintf("--https=%d", https), target)
	setSysProcAttr(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		logger.Warnf("Preview", "Tailscale Funnel for localhost:%d failed, using Cloudflare: %s", port, strings.TrimSpace(string(out)))
		_ = proxy.Close()
		m.releaseFunnelPort(https)
		return nil, false
	}

	link := fmt.Sprintf("%s:%d", base, https)
	closeFunnel := func() {
		funnelOff(https)
		_ = proxy.Close()
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

func hostRewriteProxy(port int) http.Handler {
	target := &url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)}
	host := fmt.Sprintf("localhost:%d", port)
	proxy := httputil.NewSingleHostReverseProxy(target)
	direct := proxy.Director
	proxy.Director = func(r *http.Request) {
		direct(r)
		r.Host = host
	}
	proxy.FlushInterval = -1
	return proxy
}
