package shell

import (
	"runtime"
	"testing"
)

func TestEscapeWindowsArg(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain", "claude", "claude"},
		{"empty", "", `""`},
		{"spaces", `C:\Program Files\a.cmd`, `"C:\Program Files\a.cmd"`},
		{"json", `{"alwaysThinkingEnabled":false}`, `"{\"alwaysThinkingEnabled\":false}"`},
		{"nested json", `{"a":{"b":true}}`, `"{\"a\":{\"b\":true}}"`},
		{"trailing backslash unquoted", `C:\dir\`, `C:\dir\`},
		{"trailing backslash with space", `C:\my dir\`, `"C:\my dir\\"`},
		{"backslash before quote", `a\"b`, `"a\\\"b"`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := escapeWindowsArg(tc.in); got != tc.want {
				t.Errorf("escapeWindowsArg(%q)\n got %s\nwant %s", tc.in, got, tc.want)
			}
		})
	}
}

// TestSpawnCommandPassesJSON guards the regression that broke --settings: a
// JSON argument routed through a .cmd shim must survive with its quotes intact.
func TestSpawnCommandPassesJSON(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows-only escaping")
	}

	settings := `{"alwaysThinkingEnabled":false}`
	resolved := SpawnCommand("definitely-not-a-real-binary", []string{"--settings", settings}, Environ())

	// Without a shim the argv passes through untouched.
	if !resolved.Shell {
		if resolved.Args[1] != settings {
			t.Errorf("argument mutated: %q", resolved.Args[1])
		}
		return
	}
	if want := `"{\"alwaysThinkingEnabled\":false}"`; !contains(resolved.Args, want) {
		t.Errorf("expected escaped JSON in %q", resolved.Args)
	}
}

func contains(args []string, want string) bool {
	for _, arg := range args {
		if arg == want {
			return true
		}
		if len(arg) > len(want) && indexOf(arg, want) >= 0 {
			return true
		}
	}
	return false
}

func indexOf(haystack, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}
