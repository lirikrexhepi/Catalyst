//go:build windows

package process

import (
	"os/exec"
	"syscall"

	"composer/internal/shell"
)

func applyCommandLine(cmd *exec.Cmd, resolved shell.Resolved) {
	if !resolved.Shell || resolved.CmdLine == "" {
		return
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CmdLine = resolved.CmdLine
}
