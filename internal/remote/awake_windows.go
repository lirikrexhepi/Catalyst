//go:build windows

package remote

import (
	"fmt"
	"sync"
	"syscall"
	"unsafe"
)

var (
	procPowerCreateRequest      = kernel32.NewProc("PowerCreateRequest")
	procPowerSetRequest         = kernel32.NewProc("PowerSetRequest")
	procPowerClearRequest       = kernel32.NewProc("PowerClearRequest")
	procSetThreadExecutionState = kernel32.NewProc("SetThreadExecutionState")
)

const (
	powerRequestSystemRequired      = 1
	powerRequestContextVersion      = 0
	powerRequestContextSimpleString = 1
	esSystemRequired                = 0x00000001
	esAwayModeRequired              = 0x00000040
	esContinuous                    = 0x80000000
	invalidHandle                   = ^uintptr(0)
)

type reasonContext struct {
	version uint32
	flags   uint32
	reason  *uint16
}

type awakeHold struct {
	mu     sync.Mutex
	handle uintptr
	reason *uint16
	held   bool
}

func (h *awakeHold) set(on bool) (bool, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if on == h.held {
		return false, nil
	}
	if on {
		if h.handle == 0 {
			reason, err := syscall.UTF16PtrFromString("Orchestrator: active tasks or mobile session")
			if err != nil {
				return false, err
			}
			ctx := reasonContext{version: powerRequestContextVersion, flags: powerRequestContextSimpleString, reason: reason}
			handle, _, callErr := procPowerCreateRequest.Call(uintptr(unsafe.Pointer(&ctx)))
			if handle == 0 || handle == invalidHandle {
				return false, fmt.Errorf("PowerCreateRequest: %v", callErr)
			}
			h.handle = handle
			h.reason = reason
		}
		if ok, _, callErr := procPowerSetRequest.Call(h.handle, powerRequestSystemRequired); ok == 0 {
			return false, fmt.Errorf("PowerSetRequest: %v", callErr)
		}
		// SetThreadExecutionState with ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
		// guarantees Windows will not sleep or hibernate during background tasks/remote work.
		procSetThreadExecutionState.Call(uintptr(esContinuous | esSystemRequired | esAwayModeRequired))
		h.held = true
		return true, nil
	}
	if ok, _, callErr := procPowerClearRequest.Call(h.handle, powerRequestSystemRequired); ok == 0 {
		return false, fmt.Errorf("PowerClearRequest: %v", callErr)
	}
	// Calling SetThreadExecutionState with only ES_CONTINUOUS clears the continuous requirement.
	procSetThreadExecutionState.Call(uintptr(esContinuous))
	h.held = false
	return true, nil
}
