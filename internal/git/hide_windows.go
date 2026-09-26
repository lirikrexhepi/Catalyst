//go:build windows

package git

import (
	"errors"
	"os/exec"
	"syscall"
)

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

func asExitError(err error, target **exec.ExitError) bool {
	return errors.As(err, target)
}
