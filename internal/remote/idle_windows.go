//go:build windows

package remote

import (
	"syscall"
	"time"
	"unsafe"
)

var (
	user32             = syscall.NewLazyDLL("user32.dll")
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procGetLastInput   = user32.NewProc("GetLastInputInfo")
	procGetTickCount64 = kernel32.NewProc("GetTickCount64")
)

type lastInputInfo struct {
	size uint32
	time uint32
}

func userIdle() (time.Duration, bool) {
	info := lastInputInfo{size: uint32(unsafe.Sizeof(lastInputInfo{}))}
	if ok, _, _ := procGetLastInput.Call(uintptr(unsafe.Pointer(&info))); ok == 0 {
		return 0, false
	}
	now, _, _ := procGetTickCount64.Call()
	elapsed := uint32(now) - info.time
	return time.Duration(elapsed) * time.Millisecond, true
}
