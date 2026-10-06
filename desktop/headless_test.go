package main

import (
	"strings"
	"testing"
)

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

func TestWaitPIDArg(t *testing.T) {
	cases := map[string]int{
		"--headless --wait-pid=4312": 4312,
		"--headless":                 0,
		"--headless --wait-pid=abc":  0,
		"--wait-pid=-3 --headless":   0,
	}
	for line, want := range cases {
		if got := waitPIDArg(append([]string{"orchestrator.exe"}, strings.Fields(line)...)); got != want {
			t.Errorf("%q: got %d, want %d", line, got, want)
		}
	}
}
