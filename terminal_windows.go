//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"

	"composer/internal/provider"
	"composer/internal/shell"
)

const createNewConsole = 0x00000010

func openTerminal(command provider.AccountCommand) error {
	path, found := shell.LookPath(command.Binary, command.Env)
	if !found {
		return fmt.Errorf("%s was not found on PATH", command.Binary)
	}
	comspec := os.Getenv("ComSpec")
	if comspec == "" {
		comspec = "cmd.exe"
	}
	cmd := exec.Command(comspec)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CmdLine:       terminalCommandLine(comspec, command.Title, path, command.Args),
		CreationFlags: createNewConsole,
	}
	cmd.Env = shell.Slice(command.Env)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

func terminalCommandLine(comspec, title, path string, args []string) string {
	line := `"` + path + `"`
	for _, arg := range args {
		line += " " + arg
	}
	return `"` + comspec + `" /k "title ` + terminalTitle(title) + ` && ` + line + `"`
}

func terminalTitle(title string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == ' ', r == '-', r == '.', r == ',':
			return r
		default:
			return ' '
		}
	}, title)
	cleaned = strings.Join(strings.Fields(cleaned), " ")
	if cleaned == "" {
		return "Sign in"
	}
	return cleaned
}
