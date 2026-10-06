//go:build !windows

package main

import "errors"

func monitorCount() int { return 0 }

func turnMonitorsOff() error { return errors.New("turning monitors off is only supported on Windows") }

func monitorsLikelyOff() bool { return false }

func monitorsSupported() bool { return false }
