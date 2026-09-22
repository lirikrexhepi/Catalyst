package attachments

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// maxBytes caps a single attachment. Pasted screenshots are the common case and
// sit far below this; the limit exists so a stray huge paste cannot exhaust
// memory encoding and decoding base64 through the JS bridge.
const maxBytes = 24 << 20

// maxPreviewBytes caps what is sent back for a thumbnail. Well above any
// screenshot, well below a size worth base64-ing to draw at 40px.
const maxPreviewBytes = 12 << 20

// Attachment is one file a turn will carry. Path is what the CLI adapters
// receive, so it must always be a real location on disk.
type Attachment struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
	MIME string `json:"mime,omitempty"`
	Size int64  `json:"size"`
	// Temporary marks a file Composer wrote itself, which is therefore safe to
	// delete. A file the user picked from their own disk is never removed.
	Temporary bool `json:"temporary,omitempty"`
}

var (
	ErrTooLarge = errors.New("attachment is too large")
	ErrEmpty    = errors.New("attachment is empty")
)

// Store holds attachments staged for the current run.
//
// Every CLI adapter takes a filesystem path, so a pasted image — which arrives
// as bytes, not a file — has to be written somewhere before it can be sent.
// This owns that scratch directory and its cleanup.
type Store struct {
	root string

	mu    sync.Mutex
	seq   int64
	owned map[string]string
}

func New(root string) *Store {
	return &Store{root: root, owned: make(map[string]string)}
}

// Save writes pasted or dropped bytes to the scratch directory.
//
// payload is base64 because it crosses the JS bridge, where a byte slice would
// otherwise be marshalled as a JSON number array at several times the size.
func (s *Store) Save(name, mime, payload string) (Attachment, error) {
	// Data URLs arrive straight from the clipboard as "data:image/png;base64,…";
	// accepting them here means the frontend never has to unwrap one.
	if comma := strings.IndexByte(payload, ','); comma >= 0 && strings.HasPrefix(payload, "data:") {
		if mime == "" {
			if semi := strings.IndexAny(payload[5:comma], ";"); semi >= 0 {
				mime = payload[5 : 5+semi]
			}
		}
		payload = payload[comma+1:]
	}

	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(payload))
	if err != nil {
		return Attachment{}, fmt.Errorf("decode attachment: %w", err)
	}
	if len(data) == 0 {
		return Attachment{}, ErrEmpty
	}
	if len(data) > maxBytes {
		return Attachment{}, ErrTooLarge
	}

	dir, err := s.dir()
	if err != nil {
		return Attachment{}, err
	}

	s.mu.Lock()
	s.seq++
	id := fmt.Sprintf("att-%d-%d", time.Now().UnixMilli(), s.seq)
	s.mu.Unlock()

	safe := sanitize(name)
	if ext := filepath.Ext(safe); ext == "" {
		safe += extensionFor(mime)
	}

	path := filepath.Join(dir, id+"-"+safe)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return Attachment{}, fmt.Errorf("write attachment: %w", err)
	}

	s.mu.Lock()
	s.owned[id] = path
	s.mu.Unlock()

	return Attachment{
		ID:        id,
		Name:      safe,
		Path:      path,
		MIME:      mime,
		Size:      int64(len(data)),
		Temporary: true,
	}, nil
}

// Adopt records a file the user picked from their own disk. Nothing is copied:
// the CLI reads it in place, and Composer must never delete it.
func (s *Store) Adopt(path string) (Attachment, error) {
	clean := filepath.Clean(strings.TrimSpace(path))
	info, err := os.Stat(clean)
	if err != nil {
		return Attachment{}, err
	}
	if info.IsDir() {
		return Attachment{}, errors.New("attachment is a directory")
	}
	if info.Size() > maxBytes {
		return Attachment{}, ErrTooLarge
	}

	s.mu.Lock()
	s.seq++
	id := fmt.Sprintf("att-%d-%d", time.Now().UnixMilli(), s.seq)
	s.mu.Unlock()

	return Attachment{
		ID:   id,
		Name: filepath.Base(clean),
		Path: clean,
		MIME: mimeFor(filepath.Ext(clean)),
		Size: info.Size(),
	}, nil
}

// Preview returns the file as a data URL so the composer can show a thumbnail.
//
// The bytes are read back rather than kept in memory after staging: an image
// sits in the composer only briefly, and holding every attachment in RAM for
// the life of the run to serve a 40px thumbnail is the wrong trade.
func (s *Store) Preview(path string) (string, error) {
	clean := filepath.Clean(strings.TrimSpace(path))
	info, err := os.Stat(clean)
	if err != nil {
		candidate := filepath.Join(s.root, filepath.Base(clean))
		if cinfo, cerr := os.Stat(candidate); cerr == nil {
			clean = candidate
			info = cinfo
			err = nil
		} else {
			return "", err
		}
	}
	// Only images are previewable, and a large one is not worth base64-ing
	// through the bridge just to draw it small.
	mime := mimeFor(filepath.Ext(clean))
	if !strings.HasPrefix(mime, "image/") {
		return "", errors.New("not a previewable image")
	}
	if info.Size() > maxPreviewBytes {
		return "", ErrTooLarge
	}

	data, err := os.ReadFile(clean)
	if err != nil {
		return "", err
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

// Discard deletes a staged file, but only one Composer created. Removing an
// attachment from the composer must never delete the user's own file.
func (s *Store) Discard(id string) {
	s.mu.Lock()
	path, ok := s.owned[id]
	delete(s.owned, id)
	s.mu.Unlock()

	if ok {
		_ = os.Remove(path)
	}
}

// Cleanup removes every file this run staged. Called at shutdown so pasted
// screenshots do not accumulate in the config directory forever.
func (s *Store) Cleanup() {
	s.mu.Lock()
	paths := make([]string, 0, len(s.owned))
	for _, path := range s.owned {
		paths = append(paths, path)
	}
	s.owned = make(map[string]string)
	s.mu.Unlock()

	for _, path := range paths {
		_ = os.Remove(path)
	}
}

func (s *Store) dir() (string, error) {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return "", err
	}
	return s.root, nil
}

// sanitize reduces a supplied name to something safe to join onto a path, so a
// crafted filename cannot escape the scratch directory.
func sanitize(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "" || name == "." || name == string(filepath.Separator) {
		return "pasted"
	}

	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			return r
		case r == '.', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, name)

	cleaned = strings.Trim(cleaned, "-.")
	if cleaned == "" {
		return "pasted"
	}
	if len(cleaned) > 64 {
		cleaned = cleaned[len(cleaned)-64:]
	}
	return cleaned
}

func extensionFor(mime string) string {
	switch mime {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "application/pdf":
		return ".pdf"
	case "text/plain":
		return ".txt"
	default:
		return ".bin"
	}
}

func mimeFor(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".pdf":
		return "application/pdf"
	case ".txt", ".md", ".log":
		return "text/plain"
	default:
		return ""
	}
}
