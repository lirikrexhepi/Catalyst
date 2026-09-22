package servers

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var projectMarkers = []string{
	"package.json",
	"go.mod",
	"Cargo.toml",
	"pyproject.toml",
	"composer.json",
	"Gemfile",
	"pom.xml",
	"build.gradle",
	"requirements.txt",
}

var pathPattern = regexp.MustCompile(`(?:[A-Za-z]:[\\/]|/)[^"'\s]+`)

func InferWorkdir(command string) string {
	best := ""
	for _, candidate := range pathPattern.FindAllString(command, -1) {
		dir := projectDir(strings.Trim(candidate, `"'`))
		if dir == "" {
			continue
		}
		if best == "" || len(dir) < len(best) {
			best = dir
		}
	}
	return best
}

func projectDir(path string) string {
	path = filepath.FromSlash(path)
	for _, vendor := range []string{"node_modules", "vendor", "site-packages", ".venv"} {
		marker := string(filepath.Separator) + vendor + string(filepath.Separator)
		if index := strings.Index(path, marker); index >= 0 {
			path = path[:index]
			break
		}
	}

	dir := path
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		dir = filepath.Dir(dir)
	}

	for depth := 0; depth < 12; depth++ {
		if dir == "" || dir == "." {
			return ""
		}
		if hasMarker(dir) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
	return ""
}

func hasMarker(dir string) bool {
	for _, marker := range projectMarkers {
		if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
			return true
		}
	}
	return false
}
