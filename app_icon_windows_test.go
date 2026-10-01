//go:build windows

package main

import "testing"

func TestEmbeddedAppIconsBecomeWindowsIcons(t *testing.T) {
	for _, id := range appIconIDs {
		for _, size := range []struct {
			suffix string
			px     int
		}{{"-32.png", 32}, {"-256.png", 256}} {
			data, err := appIconFiles.ReadFile("assets/logo/sized/" + id + size.suffix)
			if err != nil {
				t.Fatalf("%s%s missing: %v", id, size.suffix, err)
			}
			icon := iconFromPNG(data, size.px)
			if icon == 0 {
				t.Fatalf("%s%s did not convert to an icon", id, size.suffix)
			}
			procDestroyIcon.Call(icon)
		}
	}
}
