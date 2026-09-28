package skills

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Info struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"`
	Path        string `json:"path"`
}

func claudeDir(home string) string {
	if dir := os.Getenv("CLAUDE_CONFIG_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(home, ".claude")
}

func userRoots() []string {
	home, _ := os.UserHomeDir()
	roots := []string{filepath.Join(claudeDir(home), "skills")}
	if home == "" {
		return roots
	}
	return append(roots,
		filepath.Join(home, ".config", "opencode", "skill"),
		filepath.Join(home, ".config", "opencode", "skills"),
		filepath.Join(home, ".gemini", "config", "skills"),
		filepath.Join(home, ".agents", "skills"),
	)
}

func projectRoots(cwd string) []string {
	return []string{
		filepath.Join(cwd, ".claude", "skills"),
		filepath.Join(cwd, ".opencode", "skill"),
		filepath.Join(cwd, ".opencode", "skills"),
		filepath.Join(cwd, ".agents", "skills"),
		filepath.Join(cwd, ".agent", "skills"),
	}
}

func List(cwd string) []Info {
	found := map[string]Info{}
	for _, root := range userRoots() {
		scan(root, "user", found, 2)
	}
	if cwd != "" {
		for _, root := range projectRoots(cwd) {
			scan(root, "project", found, 2)
		}
	}
	out := make([]Info, 0, len(found))
	for _, info := range found {
		out = append(out, info)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func scan(root, source string, found map[string]Info, depth int) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, entry := range entries {
		dir := filepath.Join(root, entry.Name())
		stat, err := os.Stat(dir)
		if err != nil || !stat.IsDir() {
			continue
		}
		name, description, ok := frontMatter(filepath.Join(dir, "SKILL.md"))
		if !ok {
			if depth > 0 {
				scan(dir, source, found, depth-1)
			}
			continue
		}
		if name == "" {
			name = entry.Name()
		}
		if existing, seen := found[name]; seen && existing.Source == "project" && source != "project" {
			continue
		}
		found[name] = Info{Name: name, Description: description, Source: source, Path: dir}
	}
}

func frontMatter(path string) (string, string, bool) {
	file, err := os.Open(path)
	if err != nil {
		return "", "", false
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	if !scanner.Scan() || strings.TrimSpace(scanner.Text()) != "---" {
		return "", "", true
	}
	var name, description string
	folding := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			break
		}
		if folding && (strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t")) {
			description = strings.TrimSpace(description + " " + strings.TrimSpace(line))
			continue
		}
		folding = false
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		switch strings.TrimSpace(key) {
		case "name":
			name = value
		case "description":
			if value == ">" || value == "|" || value == ">-" || value == "|-" {
				folding = true
				value = ""
			}
			description = value
		}
	}
	return name, description, true
}
