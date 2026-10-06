//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

func TestTerminalCommandLineQuotesPathsWithSpaces(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "folder with spaces")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(dir, "fake cli.cmd")
	if err := os.WriteFile(binary, []byte("@echo ran %1 %2\r\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	comspec := os.Getenv("ComSpec")
	if comspec == "" {
		comspec = "cmd.exe"
	}
	line := terminalCommandLine(comspec, "Sign in to Claude Code (Personal & Co)", binary, []string{"auth", "login"})
	if !strings.Contains(line, "title Sign in to Claude Code Personal Co &&") {
		t.Fatalf("title was not sanitised: %s", line)
	}

	cmd := exec.Command(comspec)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine:    strings.Replace(line, " /k ", " /c ", 1),
		HideWindow: true,
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("command line failed: %v\n%s\n%s", err, line, out)
	}
	if !strings.Contains(string(out), "ran auth login") {
		t.Fatalf("the CLI was not run with its arguments:\n%s\n%q", line, out)
	}
}
