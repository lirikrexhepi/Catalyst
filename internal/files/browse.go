package files

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Place is a folder the picker can open or choose.
type Place struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// Folder is one screen of the folder picker: where it is, how to go up, and
// what can be opened from there.
type Folder struct {
	Path string `json:"path"`
	// Parent is empty at the top, where the picker shows Places instead.
	Parent  string  `json:"parent,omitempty"`
	Folders []Place `json:"folders"`
	// IsGit tells the picker this folder is a repository, the common case
	// worth pointing out when choosing a project.
	IsGit bool `json:"isGit"`
}

// skipFolder hides system folders nobody picks as a project.
func skipFolder(name string) bool {
	if strings.HasPrefix(name, "$") || strings.HasPrefix(name, ".") {
		return true
	}
	switch strings.ToLower(name) {
	case "system volume information", "node_modules", "appdata", "application data", "local settings":
		return true
	}
	return false
}

// Browse lists the sub-folders of an absolute path for the picker.
func Browse(path string) (Folder, error) {
	path = filepath.Clean(path)
	items, err := os.ReadDir(path)
	if err != nil {
		return Folder{}, err
	}
	folder := Folder{Path: path, Folders: []Place{}}
	if parent := filepath.Dir(path); parent != path {
		folder.Parent = parent
	}
	if info, err := os.Stat(filepath.Join(path, ".git")); err == nil && (info.IsDir() || info.Mode().IsRegular()) {
		folder.IsGit = true
	}
	for _, item := range items {
		if skipFolder(item.Name()) {
			continue
		}
		full := filepath.Join(path, item.Name())
		isDir := item.IsDir()
		if item.Type()&os.ModeSymlink != 0 {
			if info, err := os.Stat(full); err == nil {
				isDir = info.IsDir()
			}
		}
		if isDir {
			folder.Folders = append(folder.Folders, Place{Name: item.Name(), Path: full})
		}
	}
	sort.Slice(folder.Folders, func(i, j int) bool {
		return strings.ToLower(folder.Folders[i].Name) < strings.ToLower(folder.Folders[j].Name)
	})
	return folder, nil
}

// Places are the picker's starting points: home and its usual project
// folders, then every drive (Windows) or the file system root.
func Places() []Place {
	places := make([]Place, 0, 8)
	if home, err := os.UserHomeDir(); err == nil {
		places = append(places, Place{Name: "Home", Path: home})
		for _, name := range []string{"Projects", "projects", "source", "repos", "code", "dev", "Documents", "Desktop"} {
			candidate := filepath.Join(home, name)
			if info, err := os.Stat(candidate); err == nil && info.IsDir() && !hasPlace(places, candidate) {
				places = append(places, Place{Name: name, Path: candidate})
			}
		}
	}
	return append(places, roots()...)
}

func hasPlace(places []Place, path string) bool {
	for _, p := range places {
		if strings.EqualFold(p.Path, path) {
			return true
		}
	}
	return false
}
