//go:build windows

package main

import (
	"context"
	"os/exec"
	"syscall"
)

// updateExec hides the updater's console window, the way the autostart
// helpers do: a user-initiated update should not flash a terminal.
func updateExec(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd
}
