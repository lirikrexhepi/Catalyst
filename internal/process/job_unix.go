//go:build !windows

package process

func attachJob(*Process) {}

func closeJob(*Process) bool { return false }
