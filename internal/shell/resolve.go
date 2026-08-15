package shell

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

type Resolved struct {
	Command string
	Args    []string
	Shell   bool
}

type cacheEntry struct {
	path string
	at   time.Time
}

const cacheTTL = 5 * time.Second

var (
	mu    sync.RWMutex
	cache = map[string]cacheEntry{}
)

func pathListSeparator() string {
	if runtime.GOOS == "windows" {
		return ";"
	}
	return ":"
}

func pathExtensions(env map[string]string) []string {
	if runtime.GOOS != "windows" {
		return nil
	}
	raw := env["PATHEXT"]
	if raw == "" {
		raw = ".COM;.EXE;.BAT;.CMD"
	}
	out := make([]string, 0, 8)
	for _, ext := range strings.Split(raw, ";") {
		ext = strings.TrimSpace(ext)
		if ext == "" {
			continue
		}
		if !strings.HasPrefix(ext, ".") {
			ext = "." + ext
		}
		out = append(out, strings.ToLower(ext))
	}
	return out
}

func isExecutableFile(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	if runtime.GOOS == "windows" {
		return true
	}
	return info.Mode().Perm()&0o111 != 0
}

// LookPath resolves a bare command name against PATH and, on Windows, PATHEXT.
// An absolute or relative path is probed directly so explicitly configured
// binaries bypass PATH entirely.
func LookPath(command string, env map[string]string) (string, bool) {
	if command == "" {
		return "", false
	}
	if strings.ContainsAny(command, `/\`) {
		return probeCandidate(command, env)
	}

	key := runtime.GOOS + "\x00" + env["PATH"] + "\x00" + env["PATHEXT"] + "\x00" + command
	mu.RLock()
	entry, ok := cache[key]
	mu.RUnlock()
	if ok && time.Since(entry.at) < cacheTTL {
		return entry.path, entry.path != ""
	}

	resolved := searchPath(command, env)
	mu.Lock()
	cache[key] = cacheEntry{path: resolved, at: time.Now()}
	mu.Unlock()
	return resolved, resolved != ""
}

func probeCandidate(command string, env map[string]string) (string, bool) {
	if isExecutableFile(command) {
		return command, true
	}
	for _, ext := range pathExtensions(env) {
		candidate := command + ext
		if isExecutableFile(candidate) {
			return candidate, true
		}
	}
	return "", false
}

func searchPath(command string, env map[string]string) string {
	exts := pathExtensions(env)
	for _, dir := range strings.Split(env["PATH"], pathListSeparator()) {
		dir = strings.TrimSpace(strings.Trim(dir, `"`))
		if dir == "" {
			continue
		}
		base := filepath.Join(dir, command)
		if runtime.GOOS != "windows" {
			if isExecutableFile(base) {
				return base
			}
			continue
		}
		if filepath.Ext(base) != "" && isExecutableFile(base) {
			return base
		}
		for _, ext := range exts {
			if candidate := base + ext; isExecutableFile(candidate) {
				return candidate
			}
		}
	}
	return ""
}

var windowsShimExtensions = map[string]bool{".cmd": true, ".bat": true}

// shimTargetPattern pulls the real entry point out of an npm launcher shim,
// e.g. "%dp0%\node_modules\@scope\pkg\bin\tool.exe".
var shimTargetPattern = regexp.MustCompile(`(?i)%dp0%\\([^"%\r\n]+\.(?:exe|js|cjs|mjs))`)

// resolveShimTarget follows a .cmd/.bat launcher to the executable it wraps.
//
// Routing through cmd.exe instead is lossy: the child receives quote characters
// literally, so a JSON argument like --settings {"a":true} arrives as a
// filename no matter how it is escaped. Spawning the real binary keeps argv
// intact.
func resolveShimTarget(shimPath string) (string, bool) {
	content, err := os.ReadFile(shimPath)
	if err != nil {
		return "", false
	}

	dir := filepath.Dir(shimPath)
	for _, match := range shimTargetPattern.FindAllStringSubmatch(string(content), -1) {
		candidate := filepath.Join(dir, filepath.FromSlash(match[1]))
		if !isExecutableFile(candidate) {
			continue
		}
		if strings.EqualFold(filepath.Ext(candidate), ".exe") {
			return candidate, true
		}
		// A script entry still needs an interpreter, which reintroduces the
		// quoting problem; prefer leaving those to the shim path.
	}
	return "", false
}

// SpawnCommand prepares an argv for exec. Windows npm launcher shims (.cmd/.bat)
// cannot be spawned directly by Go's exec, so they are resolved to the binary
// they wrap, falling back to cmd.exe when no native entry point exists.
func SpawnCommand(command string, args []string, env map[string]string) Resolved {
	if runtime.GOOS != "windows" {
		return Resolved{Command: command, Args: append([]string(nil), args...)}
	}

	resolved, ok := LookPath(command, env)
	if !ok {
		resolved = command
	}
	if !windowsShimExtensions[strings.ToLower(filepath.Ext(resolved))] {
		return Resolved{Command: resolved, Args: append([]string(nil), args...)}
	}
	if target, found := resolveShimTarget(resolved); found {
		return Resolved{Command: target, Args: append([]string(nil), args...)}
	}

	escaped := make([]string, 0, len(args)+1)
	escaped = append(escaped, escapeWindowsArg(resolved))
	for _, arg := range args {
		escaped = append(escaped, escapeWindowsArg(arg))
	}
	return Resolved{Command: "cmd.exe", Args: append([]string{"/d", "/s", "/c"}, strings.Join(escaped, " ")), Shell: true}
}

// escapeWindowsArg quotes one argument for a cmd.exe command line.
//
// Two layers parse this string: cmd.exe itself, then the child's C runtime.
// The runtime expects MSVC rules (`\"` for a literal quote, backslashes before
// a quote doubled), so a JSON payload like {"a":true} must arrive as
// "{\"a\":true}" rather than the `""` form cmd.exe alone would accept.
// Shell metacharacters are additionally caret-escaped outside the quotes only
// where cmd.exe would otherwise expand them.
func escapeWindowsArg(arg string) string {
	if arg == "" {
		return `""`
	}
	if !strings.ContainsAny(arg, " \t\n\v\"^&|<>()%!") {
		return arg
	}

	var builder strings.Builder
	builder.WriteByte('"')

	backslashes := 0
	for i := 0; i < len(arg); i++ {
		switch c := arg[i]; c {
		case '\\':
			backslashes++
		case '"':
			// Backslashes preceding a quote must be doubled, then the quote
			// itself escaped, so the runtime sees a literal `"`.
			builder.WriteString(strings.Repeat(`\`, backslashes*2+1))
			builder.WriteByte('"')
			backslashes = 0
		default:
			builder.WriteString(strings.Repeat(`\`, backslashes))
			backslashes = 0
			builder.WriteByte(c)
		}
	}
	// Trailing backslashes would escape the closing quote if left single.
	builder.WriteString(strings.Repeat(`\`, backslashes*2))
	builder.WriteByte('"')
	return builder.String()
}
