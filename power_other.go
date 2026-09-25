//go:build !windows

package main

import (
	"errors"
	"time"
)

func scheduleSystemShutdown(time.Duration) error {
	return errors.New("remote shutdown is only supported on Windows")
}
