package remote

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestHostRewriteProxyRewritesHostAndCarriesWebSockets(t *testing.T) {
	var seenHost string
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenHost = r.Host
		if websocket.IsWebSocketUpgrade(r) {
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return
			}
			defer conn.Close()
			_ = conn.WriteMessage(websocket.TextMessage, []byte("connected"))
			return
		}
		_, _ = w.Write([]byte("page"))
	}))
	defer origin.Close()

	_, portText, _ := net.SplitHostPort(strings.TrimPrefix(origin.URL, "http://"))
	port, _ := strconv.Atoi(portText)
	proxy := httptest.NewServer(hostRewriteProxy(port))
	defer proxy.Close()

	req, _ := http.NewRequest(http.MethodGet, proxy.URL, nil)
	req.Host = "someone.tail1234.ts.net:8443"
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if want := "localhost:" + portText; seenHost != want {
		t.Fatalf("origin saw Host %q, want %q", seenHost, want)
	}

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(proxy.URL, "http"), nil)
	if err != nil {
		t.Fatalf("websocket through proxy: %v", err)
	}
	defer conn.Close()
	_, msg, err := conn.ReadMessage()
	if err != nil || string(msg) != "connected" {
		t.Fatalf("websocket message = %q, %v", msg, err)
	}
}

func TestFunnelPortsAreClaimedOnce(t *testing.T) {
	m := NewPreviewManager(4545)
	first, second, third := m.claimFunnelPort(), m.claimFunnelPort(), m.claimFunnelPort()
	if first == 0 || second == 0 || first == second || third != 0 {
		t.Fatalf("claims = %d, %d, %d", first, second, third)
	}
	m.releaseFunnelPort(first)
	if again := m.claimFunnelPort(); again != first {
		t.Fatalf("after release got %d, want %d", again, first)
	}
}

func TestFunnelSkippedWithoutTailscaleHost(t *testing.T) {
	m := NewPreviewManager(4545)
	m.funnelBase = func() string { return "https://abc.trycloudflare.com" }
	if _, ok := m.startFunnel(5173); ok {
		t.Fatal("funnel used for a non-Tailscale gateway")
	}
	if len(m.funnelInUse) != 0 {
		t.Fatal("a funnel port stayed claimed")
	}
}
