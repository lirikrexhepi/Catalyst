//go:build !windows

package remote

import (
	"runtime"
)

func getSystemStats() PCStats {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return PCStats{
		CPUPercent:       0,
		CPUCores:         runtime.NumCPU(),
		MemoryUsedBytes:  m.Alloc,
		MemoryTotalBytes: m.Sys,
		MemoryPercent:    0,
		UptimeSeconds:    0,
	}
}
