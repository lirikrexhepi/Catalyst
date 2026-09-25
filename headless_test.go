package main

import "testing"

func TestWantsHeadless(t *testing.T) {
	cases := map[string]bool{
		"orchestrator.exe":              false,
		"orchestrator.exe --headless":   true,
		"orchestrator.exe /HEADLESS":    true,
		"orchestrator.exe -assetdir x":  false,
		"orchestrator.exe x --headless": true,
	}
	for line, want := range cases {
		args := splitArgs(line)
		if got := wantsHeadless(args); got != want {
			t.Errorf("%q: got %v, want %v", line, got, want)
		}
	}
}

func splitArgs(line string) []string {
	var out []string
	field := ""
	for _, r := range line + " " {
		if r == ' ' {
			if field != "" {
				out = append(out, field)
			}
			field = ""
			continue
		}
		field += string(r)
	}
	return out
}
