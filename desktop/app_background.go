package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"composer/internal/logger"
)

const (
	StartOff   = "off"
	StartLogin = "login"
	StartBoot  = "boot"

	keepRunningPref = "keep_running_on_close"
)

type BackgroundSettings struct {
	StartMode          string `json:"startMode"`
	KeepRunningOnClose bool   `json:"keepRunningOnClose"`
	Supported          bool   `json:"supported"`
	ExePath            string `json:"exePath"`
}

func currentExe() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return exe, nil
}

func currentStartMode() string {
	switch {
	case bootTaskInstalled():
		return StartBoot
	case loginEntryInstalled():
		return StartLogin
	default:
		return StartOff
	}
}

func (a *App) GetBackgroundSettings() BackgroundSettings {
	exe, _ := currentExe()
	return BackgroundSettings{
		StartMode:          currentStartMode(),
		KeepRunningOnClose: a.keepRunningOnClose(),
		Supported:          autostartSupported(),
		ExePath:            exe,
	}
}

func (a *App) SetStartMode(mode string) (BackgroundSettings, error) {
	exe, err := currentExe()
	if err != nil {
		return a.GetBackgroundSettings(), err
	}
	boot := bootTaskInstalled()
	switch mode {
	case StartBoot:
		if !boot {
			if err := installBootTask(exe); err != nil {
				return a.GetBackgroundSettings(), err
			}
		}
		err = setLoginEntry(exe, false)
	case StartLogin:
		if err := setLoginEntry(exe, true); err != nil {
			return a.GetBackgroundSettings(), err
		}
		if boot {
			err = uninstallBootTask(exe)
		}
	case StartOff:
		if err := setLoginEntry(exe, false); err != nil {
			return a.GetBackgroundSettings(), err
		}
		if boot {
			err = uninstallBootTask(exe)
		}
	default:
		err = fmt.Errorf("unknown start mode %q", mode)
	}
	if err == nil {
		logger.Infof("App", "Start mode set to %s", mode)
	}
	return a.GetBackgroundSettings(), err
}

func (a *App) SetKeepRunningOnClose(enabled bool) (BackgroundSettings, error) {
	err := a.SetUserPreference(keepRunningPref, strconv.FormatBool(enabled))
	return a.GetBackgroundSettings(), err
}

func (a *App) keepRunningOnClose() bool {
	value, err := a.GetUserPreference(keepRunningPref)
	return err == nil && value == "true"
}

func (a *App) handOffToBackground() {
	exe, err := currentExe()
	if err != nil {
		logger.Errorf("App", "Cannot keep running in the background: %v", err)
		return
	}
	if err := startHeadlessAfter(exe, os.Getpid()); err != nil {
		logger.Errorf("App", "Cannot keep running in the background: %v", err)
		return
	}
	logger.Infof("App", "Window closed; background mode starts once this process exits")
}

func waitPIDArg(args []string) int {
	for _, arg := range args[1:] {
		if value, ok := strings.CutPrefix(strings.TrimSpace(arg), "--wait-pid="); ok {
			if pid, err := strconv.Atoi(value); err == nil && pid > 0 {
				return pid
			}
		}
	}
	return 0
}

func waitForExit(pid int, limit time.Duration) {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), limit)
	defer cancel()
	done := make(chan struct{})
	go func() {
		_, _ = proc.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		logger.Warnf("Main", "Window process %d still running after %s; starting anyway", pid, limit)
	}
}
