package opencode

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"catalyst/internal/domain"
	"catalyst/internal/process"
	"catalyst/internal/shell"
)

const defaultHostname = "127.0.0.1"

var listeningPattern = regexp.MustCompile(`on\s+(https?://[^\s]+)`)

// server owns a managed `opencode serve` child. When settings point at an
// external ServerURL the process is skipped entirely and only the base URL is
// used.
type server struct {
	baseURL string
	proc    *process.Process
	cancel  context.CancelFunc
}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", defaultHostname+":0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func binary(settings domain.ProviderSettings) string {
	if settings.BinaryPath != "" {
		return settings.BinaryPath
	}
	return "opencode"
}

func startServer(ctx context.Context, settings domain.ProviderSettings, client *http.Client) (*server, error) {
	if url := strings.TrimSpace(settings.ServerURL); url != "" {
		return &server{baseURL: strings.TrimSuffix(url, "/")}, nil
	}

	port, err := freePort()
	if err != nil {
		return nil, err
	}

	args := append(
		[]string{"serve", "--hostname=" + defaultHostname, fmt.Sprintf("--port=%d", port)},
		shell.TokenizeArgs(settings.LaunchArgs)...,
	)
	env := shell.Merge(shell.BaseEnvironment(), settings.Env)

	procCtx, cancel := context.WithCancel(context.Background())
	proc, err := process.Start(procCtx, process.Spec{Command: binary(settings), Args: args, Env: env})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("start opencode serve: %w", err)
	}

	// The server prints its bound URL on stdout; prefer that over the requested
	// port so a port collision resolved by the CLI is still followed.
	discovered := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(proc.Stdout())
		for scanner.Scan() {
			if match := listeningPattern.FindStringSubmatch(scanner.Text()); match != nil {
				select {
				case discovered <- strings.TrimSuffix(match[1], "/"):
				default:
				}
			}
		}
	}()

	baseURL := fmt.Sprintf("http://%s:%d", defaultHostname, port)
	select {
	case url := <-discovered:
		baseURL = url
	case <-time.After(3 * time.Second):
	case <-proc.Done():
		cancel()
		return nil, fmt.Errorf("opencode serve exited: %s", proc.StderrTail())
	}

	s := &server{baseURL: baseURL, proc: proc, cancel: cancel}
	if err := s.waitHealthy(ctx, client); err != nil {
		s.stop()
		return nil, err
	}
	return s, nil
}

func (s *server) waitHealthy(ctx context.Context, client *http.Client) error {
	deadline := time.Now().Add(20 * time.Second)
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/global/health", nil)
		if err != nil {
			return err
		}
		resp, err := client.Do(req)
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode < 400 {
				return nil
			}
		}

		if s.proc != nil {
			select {
			case <-s.proc.Done():
				return fmt.Errorf("opencode serve exited: %s", s.proc.StderrTail())
			default:
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("opencode server did not become healthy at %s", s.baseURL)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func (s *server) stop() {
	if s.cancel != nil {
		s.cancel()
	}
	if s.proc != nil {
		_ = s.proc.Shutdown(2 * time.Second)
	}
}

// subscribe streams GET /event and yields decoded frames until ctx ends.
func subscribe(ctx context.Context, client *http.Client, baseURL string, onEvent func(Event)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/event", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("event stream returned %s", resp.Status)
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 128*1024), 16*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}
		var event Event
		if json.Unmarshal([]byte(payload), &event) != nil {
			continue
		}
		onEvent(event)
	}
	return scanner.Err()
}

type httpClient struct {
	base   string
	client *http.Client
	mu     sync.Mutex
}

func (h *httpClient) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = strings.NewReader(string(encoded))
	}

	req, err := http.NewRequestWithContext(ctx, method, h.base+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("%s %s: %s: %s", method, path, resp.Status, strings.TrimSpace(string(detail)))
	}
	if out == nil {
		io.Copy(io.Discard, resp.Body)
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
