package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"composer/internal/logger"
	"composer/internal/remote"
)

// instanceInfo is what a running headless instance leaves in the config
// directory so a desktop window started later can find it and ask it to step
// aside. The secret is what authorises that request: Tailscale Funnel also
// reaches the gateway from 127.0.0.1, so arriving over loopback proves nothing.
type instanceInfo struct {
	PID     int       `json:"pid"`
	Port    int       `json:"port"`
	Secret  string    `json:"secret"`
	Started time.Time `json:"started"`
}

func instancePath() string {
	return filepath.Join(configRoot(), "headless.json")
}

func newInstanceSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func readInstance() (instanceInfo, bool) {
	data, err := os.ReadFile(instancePath())
	if err != nil {
		return instanceInfo{}, false
	}
	var info instanceInfo
	if err := json.Unmarshal(data, &info); err != nil || info.Port <= 0 || info.Secret == "" {
		return instanceInfo{}, false
	}
	return info, true
}

func writeInstance(info instanceInfo) error {
	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(instancePath()), 0o700); err != nil {
		return err
	}
	return os.WriteFile(instancePath(), data, 0o600)
}

// removeInstance deletes the instance file, but only while it still describes
// the given instance, so a stale cleanup never erases a newer run's record.
func removeInstance(secret string) {
	if info, ok := readInstance(); ok && info.Secret != secret {
		return
	}
	_ = os.Remove(instancePath())
}

func (i instanceInfo) call(method, path string, timeout time.Duration) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, fmt.Sprintf("http://127.0.0.1:%d%s", i.Port, path), strings.NewReader("{}"))
	if err != nil {
		return nil, err
	}
	req.Header.Set(remote.LocalControlHeader, i.Secret)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	_ = resp.Body.Close()
	return resp, nil
}

// alive reports whether the instance described by the file is still answering.
// A PID alone is not enough: Windows reuses them, and a crashed run leaves the
// file behind.
func (i instanceInfo) alive() bool {
	resp, err := i.call(http.MethodGet, "/api/local/instance", 2*time.Second)
	return err == nil && resp.StatusCode == http.StatusOK
}

func portFree(port int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		return false
	}
	_ = l.Close()
	return true
}

// takeOverFromHeadless runs before the desktop window opens anything. If the
// PC was started remotely a headless instance owns the gateway port, history
// and database; it is asked to shut down cleanly and given time to finish
// writing before this process opens the same files.
func takeOverFromHeadless() {
	info, ok := readInstance()
	if !ok {
		return
	}
	if !info.alive() {
		logger.Infof("Main", "Removing stale headless instance file (PID %d)", info.PID)
		removeInstance(info.Secret)
		return
	}

	logger.Infof("Main", "Headless instance (PID %d) is running; asking it to hand over", info.PID)
	exited := make(chan struct{})
	if proc, err := os.FindProcess(info.PID); err == nil {
		go func() {
			if _, err := proc.Wait(); err == nil {
				close(exited)
			}
		}()
	}

	if _, err := info.call(http.MethodPost, "/api/local/shutdown", 5*time.Second); err != nil {
		// The instance may have closed the connection while stopping; the wait
		// below is what decides whether it went away.
		logger.Warnf("Main", "Headless shutdown request: %v", err)
	}

	deadline := time.After(30 * time.Second)
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-exited:
			logger.Infof("Main", "Headless instance exited; starting the desktop app")
			removeInstance(info.Secret)
			return
		case <-tick.C:
			// Without a process handle, the file disappearing and the port
			// freeing up is the next best sign the instance has finished.
			if _, still := readInstance(); !still && portFree(info.Port) {
				logger.Infof("Main", "Headless instance released the port; starting the desktop app")
				return
			}
		case <-deadline:
			logger.Warnf("Main", "Headless instance (PID %d) did not stop within 30s; starting anyway", info.PID)
			return
		}
	}
}
