//go:build !windows

package main

import (
	"errors"
	"os/exec"
	"strconv"
)

var errAutostartUnsupported = errors.New("starting automatically is only available on Windows")

func autostartSupported() bool                     { return false }
func loginEntryInstalled() bool                    { return false }
func setLoginEntry(exe string, enabled bool) error { return errAutostartUnsupported }
func bootTaskInstalled() bool                      { return false }
func installBootTask(exe string) error             { return errAutostartUnsupported }
func uninstallBootTask(exe string) error           { return errAutostartUnsupported }

func startHeadlessAfter(exe string, pid int) error {
	return exec.Command(exe, "--headless", "--wait-pid="+strconv.Itoa(pid)).Start()
}
