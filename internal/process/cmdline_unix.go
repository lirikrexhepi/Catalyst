//go:build !windows

package process

import (
	"os/exec"

	"composer/internal/shell"
)

func applyCommandLine(*exec.Cmd, shell.Resolved) {}
