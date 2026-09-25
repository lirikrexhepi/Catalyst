// Package files reads a project's directory tree for the explorer views, and
// the rest of the disk for the folder picker. It never writes.
package files

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"unicode/utf8"
)

// Entry is one row of a directory listing.
type Entry struct {
	Name string `json:"name"`
	// Path is relative to the tree root and always slash-separated, the same
	// shape git reports, so a row can be matched against a status by string.
	Path    string `json:"path"`
	Dir     bool   `json:"dir"`
	Size    int64  `json:"size,omitempty"`
	Symlink bool   `json:"symlink,omitempty"`
	// Ignored marks entries git ignores, which the explorer dims.
	Ignored bool `json:"ignored,omitempty"`
}

// Content is a file's text for the read-only preview.
type Content struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
	// Binary is set instead of Text for files that are not UTF-8 text.
	Binary bool   `json:"binary"`
	Text   string `json:"text,omitempty"`
	// Truncated reports that only the first part of a large file was read.
	Truncated bool `json:"truncated"`
}

// hidden lists directory entries the explorer never shows. The .git directory
// is git's own bookkeeping; everything else, dotfiles included, is shown the
// way VS Code shows it.
var hidden = map[string]bool{".git": true}

// Resolve joins a slash-separated relative path onto root and refuses anything
// that lands outside it, including through a symlink.
func Resolve(root, rel string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", errors.New("no folder given")
	}
	base, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	rel = strings.TrimPrefix(filepath.FromSlash(strings.TrimSpace(rel)), string(filepath.Separator))
	if filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" {
		return "", fmt.Errorf("%s is not inside the project", rel)
	}
	target := filepath.Join(base, rel)
	if !within(target, base) {
		return "", fmt.Errorf("%s is not inside the project", rel)
	}

	// A symlink inside the project may point anywhere; the real locations
	// have to agree too. A path that does not exist yet has nothing to follow.
	realBase, err := filepath.EvalSymlinks(base)
	if err != nil {
		return "", err
	}
	if realTarget, err := filepath.EvalSymlinks(target); err == nil && !within(realTarget, realBase) {
		return "", fmt.Errorf("%s points outside the project", rel)
	}
	return target, nil
}

// within reports whether path is dir or below it. Windows paths compare
// without case, as the file system does.
func within(path, dir string) bool {
	path, dir = filepath.Clean(path), filepath.Clean(dir)
	if runtime.GOOS == "windows" {
		path, dir = strings.ToLower(path), strings.ToLower(dir)
	}
	if path == dir {
		return true
	}
	prefix := dir
	if !strings.HasSuffix(prefix, string(filepath.Separator)) {
		prefix += string(filepath.Separator)
	}
	return strings.HasPrefix(path, prefix)
}

// List reads one directory level below root, folders first, then files, each
// sorted by name without case, as file explorers do.
func List(root, rel string) ([]Entry, error) {
	dir, err := Resolve(root, rel)
	if err != nil {
		return nil, err
	}
	items, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	prefix := strings.Trim(filepath.ToSlash(filepath.Clean(filepath.FromSlash(rel))), "/")
	if prefix == "." {
		prefix = ""
	}

	entries := make([]Entry, 0, len(items))
	for _, item := range items {
		name := item.Name()
		if hidden[name] {
			continue
		}
		entry := Entry{Name: name, Path: name}
		if prefix != "" {
			entry.Path = prefix + "/" + name
		}

		info, err := item.Info()
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			entry.Symlink = true
			// Follow it for the folder/file decision; a broken link stays a file.
			if target, err := os.Stat(filepath.Join(dir, name)); err == nil {
				info = target
			}
		}
		entry.Dir = info.IsDir()
		if !entry.Dir {
			entry.Size = info.Size()
		}
		entries = append(entries, entry)
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Dir != entries[j].Dir {
			return entries[i].Dir
		}
		left, right := strings.ToLower(entries[i].Name), strings.ToLower(entries[j].Name)
		if left != right {
			return left < right
		}
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

// DefaultReadLimit bounds what a preview reads. It is a phone screen or a
// side panel, not an editor; the head of a huge file is what is useful there.
const DefaultReadLimit = 512 * 1024

// Read returns up to limit bytes of a file as text, or marks it binary.
func Read(root, rel string, limit int64) (Content, error) {
	path, err := Resolve(root, rel)
	if err != nil {
		return Content{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return Content{}, err
	}
	if info.IsDir() {
		return Content{}, fmt.Errorf("%s is a folder", rel)
	}
	if limit <= 0 {
		limit = DefaultReadLimit
	}

	file, err := os.Open(path)
	if err != nil {
		return Content{}, err
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, limit))
	if err != nil {
		return Content{}, err
	}

	out := Content{Path: filepath.ToSlash(rel), Size: info.Size(), Truncated: info.Size() > int64(len(data))}
	if looksBinary(data) {
		out.Binary = true
		return out, nil
	}
	if out.Truncated {
		// The cut can land inside a multi-byte character; drop the partial rune.
		for len(data) > 0 && !utf8.Valid(data) {
			data = data[:len(data)-1]
		}
	}
	out.Text = strings.ReplaceAll(string(data), "\r\n", "\n")
	return out, nil
}

// looksBinary uses git's own rule of thumb: a NUL byte in the first 8000
// bytes means binary. Invalid UTF-8 there counts too, since it would render
// as noise.
func looksBinary(data []byte) bool {
	head := data
	if len(head) > 8000 {
		head = head[:8000]
	}
	if bytes.IndexByte(head, 0) >= 0 {
		return true
	}
	// Trim a rune the sample boundary may have cut in half before checking.
	for i := 0; i < utf8.UTFMax && len(head) > 0 && !utf8.Valid(head); i++ {
		head = head[:len(head)-1]
	}
	return !utf8.Valid(head)
}
