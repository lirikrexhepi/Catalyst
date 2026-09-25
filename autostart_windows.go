//go:build windows

package main

import (
	_ "embed"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

//go:embed scripts/install-headless-task.ps1
var bootTaskScript string

const (
	runKeyPath   = `Software\Microsoft\Windows\CurrentVersion\Run`
	runValueName = "Orchestrator"
	bootTaskName = "Orchestrator Headless"

	createNoWindow         = 0x08000000
	detachedProcess        = 0x00000008
	createNewProcessGroup  = 0x00000200
	createBreakawayFromJob = 0x01000000
)

var errElevationCancelled = errors.New("administrator permission was not granted")

func autostartSupported() bool { return true }

func headlessCommandLine(exe string) string {
	return `"` + exe + `" --headless`
}

func loginEntryInstalled() bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, runKeyPath, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer key.Close()
	_, _, err = key.GetStringValue(runValueName)
	return err == nil
}

func setLoginEntry(exe string, enabled bool) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, runKeyPath, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	if enabled {
		return key.SetStringValue(runValueName, headlessCommandLine(exe))
	}
	if err := key.DeleteValue(runValueName); err != nil && !errors.Is(err, registry.ErrNotExist) {
		return err
	}
	return nil
}

func hiddenCommand(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd
}

func bootTaskInstalled() bool {
	return hiddenCommand("schtasks.exe", "/query", "/tn", bootTaskName).Run() == nil
}

func psQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

func runBootTaskScript(exe string, uninstall bool) error {
	dir, err := os.MkdirTemp("", "orchestrator-autostart-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	script := filepath.Join(dir, "install-headless-task.ps1")
	if err := os.WriteFile(script, []byte(bootTaskScript), 0o600); err != nil {
		return err
	}

	inner := []string{"'-NoProfile'", "'-ExecutionPolicy'", "'Bypass'", "'-File'", psQuote(`"` + script + `"`)}
	if uninstall {
		inner = append(inner, "'-Uninstall'")
	} else {
		inner = append(inner, "'-ExePath'", psQuote(`"`+exe+`"`))
	}
	command := "try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList " +
		strings.Join(inner, ",") + "; exit $p.ExitCode } catch { Write-Output $_.Exception.Message; exit 1223 }"

	out, err := hiddenCommand("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command).CombinedOutput()
	if err == nil {
		return nil
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 1223 {
		return errElevationCancelled
	}
	if msg := strings.TrimSpace(string(out)); msg != "" {
		return fmt.Errorf("%s", msg)
	}
	if errors.As(err, &exit) {
		return fmt.Errorf("the setup script stopped with code %d; the task was not changed", exit.ExitCode())
	}
	return err
}

func installBootTask(exe string) error   { return runBootTaskScript(exe, false) }
func uninstallBootTask(exe string) error { return runBootTaskScript(exe, true) }

func startHeadlessAfter(exe string, pid int) error {
	args := []string{"--headless", "--wait-pid=" + strconv.Itoa(pid)}
	start := func(flags uint32) error {
		cmd := exec.Command(exe, args...)
		cmd.Dir = filepath.Dir(exe)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: flags}
		if err := cmd.Start(); err != nil {
			return err
		}
		return cmd.Process.Release()
	}
	base := uint32(detachedProcess | createNewProcessGroup)
	if err := start(base | createBreakawayFromJob); err == nil {
		return nil
	}
	return start(base)
}
