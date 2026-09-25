//go:build windows

package files

import (
	"syscall"
)

// roots lists the drives Windows reports as present. GetLogicalDrives answers
// from a bitmask without touching the drives, so a sleeping disk or a lost
// network share cannot stall the picker.
func roots() []Place {
	kernel := syscall.NewLazyDLL("kernel32.dll")
	mask, _, _ := kernel.NewProc("GetLogicalDrives").Call()
	places := make([]Place, 0, 4)
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) == 0 {
			continue
		}
		letter := string(rune('A' + i))
		places = append(places, Place{Name: letter + ":", Path: letter + `:\`})
	}
	return places
}
