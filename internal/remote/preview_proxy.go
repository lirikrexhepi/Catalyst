package remote

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	maxRewriteBytes = 32 << 20
	minGzipBytes    = 1024
)

var inlineSourceMap = []byte("//# sourceMappingURL=data:")

var previewTransport = &http.Transport{
	Proxy:               nil,
	DialContext:         (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
	MaxIdleConns:        256,
	MaxIdleConnsPerHost: 128,
	IdleConnTimeout:     90 * time.Second,
	DisableCompression:  true,
}

func hostRewriteProxy(port int) http.Handler {
	target := &url.URL{Scheme: "http", Host: fmt.Sprintf("127.0.0.1:%d", port)}
	host := fmt.Sprintf("localhost:%d", port)
	proxy := httputil.NewSingleHostReverseProxy(target)
	direct := proxy.Director
	proxy.Director = func(r *http.Request) {
		acceptsGzip := strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
		direct(r)
		r.Host = host
		r.Header.Del("Accept-Encoding")
		if acceptsGzip {
			r.Header.Set("X-Preview-Gzip", "1")
		}
	}
	proxy.Transport = previewTransport
	proxy.FlushInterval = -1
	proxy.ModifyResponse = shrinkResponse
	return proxy
}

func compressible(contentType string) bool {
	ct := strings.ToLower(contentType)
	switch {
	case strings.Contains(ct, "event-stream"):
		return false
	case strings.HasPrefix(ct, "text/"),
		strings.Contains(ct, "javascript"),
		strings.Contains(ct, "json"),
		strings.Contains(ct, "svg"),
		strings.Contains(ct, "xml"),
		strings.Contains(ct, "wasm"):
		return true
	}
	return false
}

func isScript(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.Contains(ct, "javascript") || strings.Contains(ct, "typescript")
}

func stripInlineSourceMap(body []byte) []byte {
	idx := bytes.LastIndex(body, inlineSourceMap)
	if idx < 0 {
		return body
	}
	rest := body[idx:]
	if end := bytes.IndexByte(rest, '\n'); end >= 0 && len(bytes.TrimSpace(rest[end:])) > 0 {
		return body
	}
	return bytes.TrimRight(body[:idx], " \t\r\n")
}

func shrinkResponse(resp *http.Response) error {
	gzipOK := resp.Request != nil && resp.Request.Header.Get("X-Preview-Gzip") == "1"
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Content-Encoding") != "" || resp.Body == nil {
		return nil
	}
	contentType := resp.Header.Get("Content-Type")
	if !compressible(contentType) {
		return nil
	}
	if resp.ContentLength < 0 || resp.ContentLength > maxRewriteBytes {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRewriteBytes+1))
	_ = resp.Body.Close()
	if err != nil {
		return err
	}
	if isScript(contentType) {
		body = stripInlineSourceMap(body)
	}

	if gzipOK && len(body) >= minGzipBytes {
		var buf bytes.Buffer
		writer, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
		_, _ = writer.Write(body)
		_ = writer.Close()
		body = buf.Bytes()
		resp.Header.Set("Content-Encoding", "gzip")
	}
	resp.Header.Add("Vary", "Accept-Encoding")
	resp.Body = io.NopCloser(bytes.NewReader(body))
	resp.ContentLength = int64(len(body))
	resp.Header.Set("Content-Length", strconv.Itoa(len(body)))
	return nil
}

func startPreviewProxy(port int) (string, func(), error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, err
	}
	server := &http.Server{Handler: hostRewriteProxy(port), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = server.Serve(listener) }()
	return "http://" + listener.Addr().String(), func() { _ = server.Close() }, nil
}
