//go:build windows

package remote

import (
	"runtime"
	"sync"
	"time"
	"unsafe"
)

var (
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
)

type filetime struct {
	dwLowDateTime  uint32
	dwHighDateTime uint32
}

func (f filetime) toUint64() uint64 {
	return uint64(f.dwHighDateTime)<<32 | uint64(f.dwLowDateTime)
}

type memoryStatusEx struct {
	cbSize                  uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

type cpuSampler struct {
	mu         sync.Mutex
	prevIdle   uint64
	prevKernel uint64
	prevUser   uint64
	prevTime   time.Time
	lastCPU    float64
}

var globalCPUSampler = &cpuSampler{}

func (s *cpuSampler) sample() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()

	var idle, kernel, user filetime
	ret, _, _ := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)),
	)
	if ret == 0 {
		return s.lastCPU
	}

	idleU64 := idle.toUint64()
	kernelU64 := kernel.toUint64()
	userU64 := user.toUint64()
	now := time.Now()

	if s.prevTime.IsZero() {
		s.prevIdle = idleU64
		s.prevKernel = kernelU64
		s.prevUser = userU64
		s.prevTime = now
		time.Sleep(100 * time.Millisecond)
		ret2, _, _ := procGetSystemTimes.Call(
			uintptr(unsafe.Pointer(&idle)),
			uintptr(unsafe.Pointer(&kernel)),
			uintptr(unsafe.Pointer(&user)),
		)
		if ret2 != 0 {
			idleU64 = idle.toUint64()
			kernelU64 = kernel.toUint64()
			userU64 = user.toUint64()
		}
	}

	idleDelta := idleU64 - s.prevIdle
	kernelDelta := kernelU64 - s.prevKernel
	userDelta := userU64 - s.prevUser
	totalDelta := kernelDelta + userDelta

	s.prevIdle = idleU64
	s.prevKernel = kernelU64
	s.prevUser = userU64
	s.prevTime = now

	if totalDelta == 0 {
		return s.lastCPU
	}

	if idleDelta > totalDelta {
		idleDelta = totalDelta
	}
	busyDelta := totalDelta - idleDelta
	usage := (float64(busyDelta) / float64(totalDelta)) * 100.0
	if usage < 0 {
		usage = 0
	} else if usage > 100 {
		usage = 100
	}
	s.lastCPU = usage
	return usage
}

func getSystemStats() PCStats {
	cpu := globalCPUSampler.sample()

	var ms memoryStatusEx
	ms.cbSize = uint32(unsafe.Sizeof(ms))
	var usedBytes, totalBytes uint64
	var memPercent float64
	if ret, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms))); ret != 0 {
		totalBytes = ms.ullTotalPhys
		if ms.ullAvailPhys < totalBytes {
			usedBytes = totalBytes - ms.ullAvailPhys
		}
		memPercent = float64(ms.dwMemoryLoad)
		if memPercent == 0 && totalBytes > 0 {
			memPercent = (float64(usedBytes) / float64(totalBytes)) * 100.0
		}
	}

	var uptimeSec uint64
	if ret, _, _ := procGetTickCount64.Call(); ret != 0 {
		uptimeSec = uint64(ret) / 1000
	}

	return PCStats{
		CPUPercent:       cpu,
		CPUCores:         runtime.NumCPU(),
		MemoryUsedBytes:  usedBytes,
		MemoryTotalBytes: totalBytes,
		MemoryPercent:    memPercent,
		UptimeSeconds:    uptimeSec,
	}
}
