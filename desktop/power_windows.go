//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// scheduleSystemShutdown asks Windows to power off after the delay. The delay
// is the app's window to stop agents and flush history first.
func scheduleSystemShutdown(delay time.Duration) error {
	seconds := strconv.Itoa(int(delay.Seconds()))
	cmd := exec.Command("shutdown.exe", "/s", "/t", seconds, "/c", "Orchestrator: shutdown requested from the phone")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	out, err := cmd.CombinedOutput()
	if err != nil {
		if msg := strings.TrimSpace(string(out)); msg != "" {
			return fmt.Errorf("shutdown.exe: %s", msg)
		}
		return fmt.Errorf("shutdown.exe: %w", err)
	}
	return nil
}
