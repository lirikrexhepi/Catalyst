//go:build !windows

package remote

import "os/exec"

func setSysProcAttr(cmd *exec.Cmd) {}
