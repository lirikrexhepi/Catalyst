//go:build !windows

package main

func setWindowIcon(_, _ []byte) error {
	return nil
}
