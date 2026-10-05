//go:build !windows

package main

func retargetAppShortcuts(_ string) error {
	return nil
}

func notifyShellIconChanged() {
}
