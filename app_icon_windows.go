//go:build windows

package main

import (
	"errors"
	"os"
	"sync"
	"syscall"
	"unsafe"
)

var (
	iconUser32 = syscall.NewLazyDLL("user32.dll")

	procCreateIconFromRes  = iconUser32.NewProc("CreateIconFromResourceEx")
	procDestroyIcon        = iconUser32.NewProc("DestroyIcon")
	procEnumWindows        = iconUser32.NewProc("EnumWindows")
	procGetWindowThreadPID = iconUser32.NewProc("GetWindowThreadProcessId")
	procSendMessageW       = iconUser32.NewProc("SendMessageW")
	procIsWindowVisible    = iconUser32.NewProc("IsWindowVisible")
	windowIconMu           sync.Mutex
	windowIcons            [2]uintptr
)

const (
	wmSetIcon = 0x0080
	iconSmall = 0
	iconBig   = 1
)

func iconFromPNG(data []byte, size int) uintptr {
	if len(data) == 0 {
		return 0
	}
	handle, _, _ := procCreateIconFromRes.Call(
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)),
		1,
		0x00030000,
		uintptr(size),
		uintptr(size),
		0,
	)
	return handle
}

func processWindows() []uintptr {
	pid := uint32(os.Getpid())
	var found []uintptr
	callback := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		var owner uint32
		procGetWindowThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&owner)))
		if owner == pid {
			if visible, _, _ := procIsWindowVisible.Call(hwnd); visible != 0 {
				found = append(found, hwnd)
			}
		}
		return 1
	})
	procEnumWindows.Call(callback, 0)
	return found
}

func setWindowIcon(small, big []byte) error {
	smallIcon := iconFromPNG(small, 32)
	bigIcon := iconFromPNG(big, 256)
	if smallIcon == 0 || bigIcon == 0 {
		return errors.New("could not create the window icon")
	}
	windows := processWindows()
	if len(windows) == 0 {
		procDestroyIcon.Call(smallIcon)
		procDestroyIcon.Call(bigIcon)
		return errors.New("no window to set the icon on")
	}
	for _, hwnd := range windows {
		procSendMessageW.Call(hwnd, wmSetIcon, iconSmall, smallIcon)
		procSendMessageW.Call(hwnd, wmSetIcon, iconBig, bigIcon)
	}
	windowIconMu.Lock()
	previous := windowIcons
	windowIcons = [2]uintptr{smallIcon, bigIcon}
	windowIconMu.Unlock()
	for _, icon := range previous {
		if icon != 0 {
			procDestroyIcon.Call(icon)
		}
	}
	return nil
}
