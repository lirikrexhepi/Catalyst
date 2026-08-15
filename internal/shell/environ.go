package shell

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

var (
	baseOnce sync.Once
	baseEnv  map[string]string
)

// BaseEnvironment returns the process environment enriched, on Unix, with the
// PATH a login shell would produce. GUI apps launched from Finder or a desktop
// launcher inherit a minimal PATH that omits ~/.local/bin, Homebrew and nvm,
// which is exactly where the agent CLIs install.
func BaseEnvironment() map[string]string {
	baseOnce.Do(func() {
		baseEnv = Environ()
		if runtime.GOOS == "windows" {
			return
		}
		if loginPath := readLoginShellPath(); loginPath != "" {
			baseEnv["PATH"] = MergePath(loginPath, baseEnv["PATH"])
		}
		baseEnv["PATH"] = MergePath(baseEnv["PATH"], defaultUnixPathCandidates()...)
	})
	out := make(map[string]string, len(baseEnv))
	for k, v := range baseEnv {
		out[k] = v
	}
	return out
}

func Environ() map[string]string {
	env := make(map[string]string, len(os.Environ()))
	for _, entry := range os.Environ() {
		if key, value, ok := strings.Cut(entry, "="); ok {
			env[normalizeKey(key)] = value
		}
	}
	return env
}

// normalizeKey uppercases PATH-family keys so lookups are stable on Windows,
// where the environment is case-insensitive but Go's map is not.
func normalizeKey(key string) string {
	switch strings.ToUpper(key) {
	case "PATH":
		return "PATH"
	case "PATHEXT":
		return "PATHEXT"
	}
	return key
}

func Merge(base map[string]string, overrides ...map[string]string) map[string]string {
	out := make(map[string]string, len(base)+8)
	for k, v := range base {
		out[k] = v
	}
	for _, override := range overrides {
		for k, v := range override {
			out[normalizeKey(k)] = v
		}
	}
	return out
}

func Slice(env map[string]string) []string {
	out := make([]string, 0, len(env))
	for k, v := range env {
		out = append(out, k+"="+v)
	}
	return out
}

func MergePath(primary string, extra ...string) string {
	sep := pathListSeparator()
	seen := make(map[string]bool)
	out := make([]string, 0, 32)
	appendAll := func(value string) {
		for _, entry := range strings.Split(value, sep) {
			entry = strings.TrimSpace(entry)
			if entry == "" {
				continue
			}
			key := entry
			if runtime.GOOS == "windows" {
				key = strings.ToLower(entry)
			}
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, entry)
		}
	}
	appendAll(primary)
	for _, value := range extra {
		appendAll(value)
	}
	return strings.Join(out, sep)
}

func defaultUnixPathCandidates() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	return []string{
		home + "/.local/bin",
		home + "/.bun/bin",
		home + "/.cargo/bin",
		"/opt/homebrew/bin",
		"/usr/local/bin",
	}
}

func readLoginShellPath() string {
	loginShell := os.Getenv("SHELL")
	if loginShell == "" {
		loginShell = "/bin/sh"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, loginShell, "-lic", "printf '%s' \"$PATH\"")
	cmd.Env = append(os.Environ(), "CATALYST_PATH_PROBE=1")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
