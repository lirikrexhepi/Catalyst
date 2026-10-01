package remote

import (
	"compress/gzip"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func startBackend(t *testing.T, handler http.HandlerFunc) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &httptest.Server{Listener: listener, Config: &http.Server{Handler: handler}}
	server.Start()
	t.Cleanup(server.Close)
	return listener.Addr().(*net.TCPAddr).Port
}

func TestPreviewProxyStripsSourceMapsAndGzips(t *testing.T) {
	code := strings.Repeat("export const value = 1;\n", 400)
	module := code + "//# sourceMappingURL=data:application/json;base64," + strings.Repeat("QUFB", 20000) + "\n"
	var gotHost string
	port := startBackend(t, func(w http.ResponseWriter, r *http.Request) {
		gotHost = r.Host
		w.Header().Set("Content-Type", "text/javascript")
		w.Header().Set("Content-Length", strconv.Itoa(len(module)))
		_, _ = io.WriteString(w, module)
	})
	base, stop, err := startPreviewProxy(port)
	if err != nil {
		t.Fatal(err)
	}
	defer stop()

	req, _ := http.NewRequest(http.MethodGet, base+"/src/main.ts", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	resp, err := (&http.Transport{DisableCompression: true}).RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.Header.Get("Content-Encoding") != "gzip" {
		t.Fatalf("expected gzip, got %q", resp.Header.Get("Content-Encoding"))
	}
	wire, _ := io.ReadAll(resp.Body)
	reader, err := gzip.NewReader(strings.NewReader(string(wire)))
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := io.ReadAll(reader)
	if strings.Contains(string(plain), "sourceMappingURL") {
		t.Fatal("inline source map was not removed")
	}
	if strings.TrimSpace(string(plain)) != strings.TrimSpace(code) {
		t.Fatal("module code changed")
	}
	if len(wire)*10 > len(module) {
		t.Fatalf("expected at least 10x smaller, got %d -> %d bytes", len(module), len(wire))
	}
	if gotHost != "localhost:"+strconv.Itoa(port) {
		t.Fatalf("host header %q", gotHost)
	}
}

func TestPreviewProxyLeavesBinaryAndPlainClientsAlone(t *testing.T) {
	image := strings.Repeat("\x89PNG", 1000)
	port := startBackend(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/a.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = io.WriteString(w, image)
			return
		}
		w.Header().Set("Content-Type", "text/css")
		w.Header().Set("Content-Length", "3000")
		_, _ = io.WriteString(w, strings.Repeat("a{}", 1000))
	})
	base, stop, err := startPreviewProxy(port)
	if err != nil {
		t.Fatal(err)
	}
	defer stop()
	client := &http.Transport{DisableCompression: true}

	req, _ := http.NewRequest(http.MethodGet, base+"/a.png", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	resp, err := client.RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.Header.Get("Content-Encoding") != "" || string(body) != image {
		t.Fatal("binary responses must pass through untouched")
	}

	req, _ = http.NewRequest(http.MethodGet, base+"/x.css", nil)
	resp, err = client.RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.Header.Get("Content-Encoding") != "" || len(body) != 3000 {
		t.Fatal("clients without gzip must get plain bodies")
	}
}
