package main

import (
	"bufio"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"composer/internal/logger"
	"composer/internal/remote"
)

const (
	monitorsAutoOffPref = "monitors_auto_off_after_wake"
	problemTailBytes    = 512 * 1024
	problemLines        = 40
	autoOffDelay        = 20 * time.Second
)

func (a *App) monitorsAutoOff() bool {
	value, err := a.GetUserPreference(monitorsAutoOffPref)
	return err == nil && value == "true"
}

func (a *App) remoteMonitors() remote.MonitorStatus {
	return remote.MonitorStatus{
		Supported: monitorsSupported(),
		Count:     monitorCount(),
		Off:       monitorsLikelyOff(),
		AutoOff:   a.monitorsAutoOff(),
	}
}

func (a *App) remoteSetMonitorsAutoOff(enabled bool) error {
	return a.SetUserPreference(monitorsAutoOffPref, strconv.FormatBool(enabled))
}

func (a *App) turnMonitorsOffAfterWake() {
	if !a.monitorsAutoOff() || !monitorsSupported() {
		return
	}
	time.Sleep(autoOffDelay)
	if err := turnMonitorsOff(); err != nil {
		logger.Warnf("Monitors", "Could not turn monitors off after wake: %v", err)
		return
	}
	logger.Infof("Monitors", "Turned monitors off after a remote wake")
}

func recentProblems() []string {
	file, err := os.Open(filepath.Join(configRoot(), "orchestrator_debug.log"))
	if err != nil {
		return []string{}
	}
	defer file.Close()
	if info, err := file.Stat(); err == nil && info.Size() > problemTailBytes {
		_, _ = file.Seek(-problemTailBytes, io.SeekEnd)
	}
	raw, err := io.ReadAll(file)
	if err != nil {
		return []string{}
	}
	out := make([]string, 0, problemLines)
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.Contains(line, "[ERROR]") && !strings.Contains(line, "[WARN ]") {
			continue
		}
		if len(line) > 400 {
			line = line[:400]
		}
		out = append(out, line)
		if len(out) > problemLines {
			out = out[1:]
		}
	}
	return out
}

func (a *App) pcHooks() remote.PCHooks {
	return remote.PCHooks{
		Monitors:       a.remoteMonitors,
		MonitorsOff:    turnMonitorsOff,
		SetMonitorsOff: a.remoteSetMonitorsAutoOff,
		RecentProblems: recentProblems,
		Headless:       func() bool { return a.headless },
	}
}
