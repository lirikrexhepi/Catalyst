package projects

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// maxFaviconBytes caps what will ever be served as a project icon. Favicons
// are tiny; anything larger is a misdetected asset, not an icon.
const maxFaviconBytes = 512 * 1024

// ErrNoFavicon reports that a project has no detectable app icon.
var ErrNoFavicon = errors.New("no favicon found")

var contentTypes = map[string]string{
	".ico":  "image/x-icon",
	".png":  "image/png",
	".svg":  "image/svg+xml",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".bmp":  "image/bmp",
}

// htmlEntryFiles are the pages scanned for <link rel="icon">, in the order a
// browser would plausibly load them for the project.
var htmlEntryFiles = []string{
	"index.html",
	"public/index.html",
	"src/index.html",
	"app/index.html",
	"dist/index.html",
	"build/index.html",
}

var manifestFiles = []string{
	"manifest.json",
	"manifest.webmanifest",
	"site.webmanifest",
	"public/manifest.json",
	"public/manifest.webmanifest",
	"public/site.webmanifest",
}

var wellKnownDirs = []string{"", "public", "static", "assets", "src"}

var wellKnownNames = []string{
	"favicon.ico",
	"favicon.svg",
	"favicon.png",
	"favicon-32x32.png",
	"favicon-16x16.png",
	"apple-touch-icon.png",
	"apple-touch-icon-precomposed.png",
}

var linkTag = regexp.MustCompile(`(?i)<link\b[^>]*>`)
var attrPattern = regexp.MustCompile(`(?i)(rel|href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)

// Find locates a project's app icon the way a browser would: the page's
// <link rel="icon"> first, then the web manifest's icons, then the well-known
// filenames. It returns the raw bytes and content type, or ErrNoFavicon.
func Find(root string) ([]byte, string, error) {
	clean := filepath.Clean(root)
	if clean == "" || clean == "." {
		return nil, "", ErrNoFavicon
	}

	for _, entry := range htmlEntryFiles {
		htmlPath := filepath.Join(clean, entry)
		href, ok := iconLink(htmlPath)
		if !ok {
			continue
		}
		if data, ctype, err := resolve(clean, filepath.Dir(htmlPath), href); err == nil {
			return data, ctype, nil
		}
	}

	for _, manifest := range manifestFiles {
		manifestPath := filepath.Join(clean, manifest)
		src, ok := manifestIcon(manifestPath)
		if !ok {
			continue
		}
		if data, ctype, err := resolve(clean, filepath.Dir(manifestPath), src); err == nil {
			return data, ctype, nil
		}
	}

	for _, dir := range wellKnownDirs {
		for _, name := range wellKnownNames {
			path := filepath.Join(clean, dir, name)
			if data, ctype, err := readIcon(path); err == nil {
				return data, ctype, nil
			}
		}
	}

	return nil, "", ErrNoFavicon
}

// iconLink reports the href of the preferred <link> icon in an HTML file.
// An exact rel="icon" wins; otherwise the first apple-touch-icon or shortcut
// icon is used, mirroring what ends up in a browser tab.
func iconLink(htmlPath string) (string, bool) {
	head, err := readHead(htmlPath)
	if err != nil {
		return "", false
	}
	var fallback string
	for _, tag := range linkTag.FindAllString(head, -1) {
		rel, href := "", ""
		for _, m := range attrPattern.FindAllStringSubmatch(tag, -1) {
			value := strings.Trim(m[2], `"'`)
			switch strings.ToLower(m[1]) {
			case "rel":
				rel = strings.ToLower(value)
			case "href":
				href = value
			}
		}
		if href == "" {
			continue
		}
		tokens := strings.Fields(rel)
		if hasToken(tokens, "icon") && !hasToken(tokens, "shortcut") {
			return href, true
		}
		if fallback == "" && (hasToken(tokens, "apple-touch-icon") ||
			hasToken(tokens, "apple-touch-icon-precomposed") ||
			hasToken(tokens, "shortcut")) {
			fallback = href
		}
	}
	if fallback != "" {
		return fallback, true
	}
	return "", false
}

func hasToken(tokens []string, want string) bool {
	for _, token := range tokens {
		if token == want {
			return true
		}
	}
	return false
}

// manifestIcon picks the most suitable icon from a web manifest: the largest
// one at or below 192px, else the smallest above it, else the first entry.
func manifestIcon(manifestPath string) (string, bool) {
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return "", false
	}
	var manifest struct {
		Icons []struct {
			Src   string `json:"src"`
			Sizes string `json:"sizes"`
		} `json:"icons"`
	}
	if json.Unmarshal(raw, &manifest) != nil || len(manifest.Icons) == 0 {
		return "", false
	}
	best := ""
	bestSize := -1
	for _, icon := range manifest.Icons {
		if icon.Src == "" {
			continue
		}
		size := largestSide(icon.Sizes)
		if best == "" {
			best, bestSize = icon.Src, size
			continue
		}
		if size <= 0 || bestSize <= 0 {
			continue
		}
		if (size <= 192 && size > bestSize) || (bestSize > 192 && size < bestSize) {
			best, bestSize = icon.Src, size
		}
	}
	if best == "" {
		return "", false
	}
	return best, true
}

// largestSide parses a "WxH" sizes value, returning -1 when it is missing or
// "any" (a maskable/vector entry with no intrinsic size).
func largestSide(sizes string) int {
	best := -1
	for _, part := range strings.Fields(sizes) {
		dims := strings.SplitN(strings.ToLower(part), "x", 2)
		if len(dims) != 2 {
			continue
		}
		w, errW := strconv.Atoi(dims[0])
		h, errH := strconv.Atoi(dims[1])
		if errW != nil || errH != nil {
			continue
		}
		if w > best {
			best = w
		}
		if h > best {
			best = h
		}
	}
	return best
}

// resolve maps an href from an HTML or manifest file to a file inside the
// project root. Remote and embedded references are not icons on disk.
func resolve(root, base, href string) ([]byte, string, error) {
	clean := strings.SplitN(strings.TrimSpace(href), "#", 2)[0]
	clean = strings.SplitN(clean, "?", 2)[0]
	if clean == "" {
		return nil, "", ErrNoFavicon
	}
	lower := strings.ToLower(clean)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") ||
		strings.HasPrefix(clean, "//") || strings.HasPrefix(lower, "data:") {
		return nil, "", ErrNoFavicon
	}
	var candidates []string
	if strings.HasPrefix(clean, "/") {
		trimmed := strings.TrimPrefix(clean, "/")
		candidates = []string{
			filepath.Join(root, "public", trimmed),
			filepath.Join(root, trimmed),
		}
	} else {
		candidates = []string{filepath.Join(base, clean)}
	}
	for _, path := range candidates {
		if !withinRoot(root, path) {
			continue
		}
		if data, ctype, err := readIcon(path); err == nil {
			return data, ctype, nil
		}
	}
	return nil, "", ErrNoFavicon
}

// withinRoot rejects hrefs that escape the project, so a crafted
// <link rel="icon" href="../../etc/..."> can never leak files outside it.
func withinRoot(root, path string) bool {
	rel, err := filepath.Rel(root, filepath.Clean(path))
	if err != nil || rel == "." || filepath.IsAbs(rel) {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// readHead reads enough of an HTML file to cover its <head> without loading
// whole bundles when the entry point is a built artifact.
func readHead(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	head, err := io.ReadAll(io.LimitReader(file, 32*1024))
	if err != nil {
		return "", err
	}
	return string(head), nil
}

// readIcon loads an icon file, enforcing the size cap and a known image type
// so callers can serve it with a correct content type.
func readIcon(path string) ([]byte, string, error) {
	ctype, ok := contentTypes[strings.ToLower(filepath.Ext(path))]
	if !ok {
		return nil, "", ErrNoFavicon
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxFaviconBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) > maxFaviconBytes || len(data) == 0 {
		return nil, "", ErrNoFavicon
	}
	return data, ctype, nil
}
