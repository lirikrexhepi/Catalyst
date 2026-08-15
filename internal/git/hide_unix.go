//go:build !windows

package git

import (
	"errors"
	"os/exec"
)

func hideWindow(*exec.Cmd) {}

func asExitError(err error, target **exec.ExitError) bool {
	return errors.As(err, target)
}
