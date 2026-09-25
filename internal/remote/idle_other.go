//go:build !windows

package remote

import "time"

func userIdle() (time.Duration, bool) {
	return 0, false
}
