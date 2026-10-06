//go:build windows

package main

import (
	"sync"
	"unsafe"
)

var (
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
	procPostMessage      = user32.NewProc("PostMessageW")
	procGetLastInputInfo = user32.NewProc("GetLastInputInfo")
	procGetTickCount     = kernel32.NewProc("GetTickCount")
	monitorsMu           sync.Mutex
	monitorsOffTick      uint32
)

const (
	smCMonitors     = 80
	hwndBroadcast   = 0xFFFF
	wmSysCommand    = 0x0112
	scMonitorPower  = 0xF170
	monitorPowerOff = 2
)

type lastInputInfo struct {
	size uint32
	time uint32
}

func monitorCount() int {
	n, _, _ := procGetSystemMetrics.Call(smCMonitors)
	return int(n)
}

func lastInputTick() uint32 {
	info := lastInputInfo{size: uint32(unsafe.Sizeof(lastInputInfo{}))}
	ok, _, _ := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&info)))
	if ok == 0 {
		return 0
	}
	return info.time
}

func tickNow() uint32 {
	t, _, _ := procGetTickCount.Call()
	return uint32(t)
}

func turnMonitorsOff() error {
	monitorsMu.Lock()
	monitorsOffTick = tickNow()
	monitorsMu.Unlock()
	ok, _, err := procPostMessage.Call(hwndBroadcast, wmSysCommand, scMonitorPower, monitorPowerOff)
	if ok == 0 {
		return err
	}
	return nil
}

func monitorsLikelyOff() bool {
	monitorsMu.Lock()
	off := monitorsOffTick
	monitorsMu.Unlock()
	if off == 0 {
		return false
	}
	return int32(lastInputTick()-off) <= 0
}

func monitorsSupported() bool { return true }
