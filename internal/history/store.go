// Package history persists sessions so a workspace can be reopened after the
// app restarts.
//
// The unit of storage is the workspace, not the thread. Catalyst spawns several
// agents from one orchestrator request, and reading that request back means
// reading the orchestrator's side of it together with every agent it started —
// so all of them live in one directory and load as a set.
//
// Layout, one directory per workspace:
//
//	<root>/<workspaceID>/meta.json           workspace, tasks, resume ids
//	<root>/<workspaceID>/<threadID>.jsonl    one event per line
//
// JSONL for the transcripts because events only ever append: a line can be
// written as it is published without rewriting the file, a truncated tail from
// a crash costs one event rather than the session, and no migration is needed
// when the event shape changes.
package history

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"catalyst/internal/domain"
)

const (
	metaFile      = "meta.json"
	transcriptExt = ".jsonl"
	// Long transcripts are read back in full, so a ceiling keeps a runaway
	// session from becoming unloadable. Generous: a busy agent produces a few
	// thousand events in a long task.
	maxEventsPerThread = 20000
)

// Meta is everything about a workspace except the transcripts themselves.
type Meta struct {
	Workspace domain.Workspace `json:"workspace"`
	Tasks     []domain.Task    `json:"tasks"`
	// CoordinatorThreadID is the orchestrator conversation that produced this
	// workspace. Stored explicitly because it is what distinguishes a Catalyst
	// session from a single agent's chat log.
	CoordinatorThreadID string `json:"coordinatorThreadId,omitempty"`
	// Resume maps a thread id to the provider's own session id, which is what a
	// CLI needs to continue a conversation it started in an earlier run.
	Resume map[string]string `json:"resume,omitempty"`
	// Version allows a later format change to be detected rather than guessed.
	Version int `json:"version"`
}

const currentVersion = 1

// Session is a workspace loaded back in full: its metadata plus every
// transcript, keyed by thread id.
type Session struct {
	Meta        Meta                             `json:"meta"`
	Transcripts map[string][]domain.RuntimeEvent `json:"transcripts"`
}

// Store owns the on-disk history tree.
//
// Writes are serialised through a single mutex. Event append is the hot path —
// it happens for every streamed token — so each append writes one line to an
// already-open file rather than reopening or rewriting anything.
type Store struct {
	root string

	mu      sync.Mutex
	open    map[string]*openFile
	counts  map[string]int
	disabled bool
}

type openFile struct {
	file   *os.File
	writer *bufio.Writer
}

// New opens (and creates) the history tree at root.
//
// A store that cannot create its directory is returned disabled rather than as
// an error: failing to persist history must never stop the app from running
// agents, which is the thing the user actually asked for.
func New(root string) *Store {
	store := &Store{
		root:   root,
		open:   make(map[string]*openFile),
		counts: make(map[string]int),
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		store.disabled = true
	}
	return store
}

// Root reports where history is being written, for diagnostics.
func (s *Store) Root() string { return s.root }

func (s *Store) workspaceDir(workspaceID string) string {
	return filepath.Join(s.root, safeName(workspaceID))
}

// SaveMeta writes a workspace's metadata, replacing any previous copy.
//
// Written whole and atomically: unlike the transcripts this is a small document
// that changes shape as tasks complete, and a half-written meta.json would make
// the whole workspace unreadable.
func (s *Store) SaveMeta(meta Meta) error {
	if s.disabled {
		return nil
	}
	if meta.Workspace.ID == "" {
		return errors.New("workspace id is required")
	}
	meta.Version = currentVersion

	dir := s.workspaceDir(meta.Workspace.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	payload, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(dir, metaFile), payload)
}

// LoadMeta reads one workspace's metadata.
func (s *Store) LoadMeta(workspaceID string) (Meta, error) {
	var meta Meta
	payload, err := os.ReadFile(filepath.Join(s.workspaceDir(workspaceID), metaFile))
	if err != nil {
		return meta, err
	}
	if err := json.Unmarshal(payload, &meta); err != nil {
		return meta, err
	}
	return meta, nil
}

// Append records one event on a thread's transcript.
//
// Buffered rather than synced per line: an event is cheap to lose and expensive
// to fsync, and the flush on Close covers the ordinary exit. A crash costs at
// most the tail of a transcript, never the workspace.
func (s *Store) Append(workspaceID, threadID string, event domain.RuntimeEvent) error {
	if s.disabled || workspaceID == "" || threadID == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	key := workspaceID + "/" + threadID
	if s.counts[key] >= maxEventsPerThread {
		return nil
	}

	handle, err := s.handleLocked(workspaceID, threadID)
	if err != nil {
		return err
	}

	line, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := handle.writer.Write(append(line, '\n')); err != nil {
		return err
	}
	s.counts[key]++
	return nil
}

func (s *Store) handleLocked(workspaceID, threadID string) (*openFile, error) {
	key := workspaceID + "/" + threadID
	if handle, ok := s.open[key]; ok {
		return handle, nil
	}

	dir := s.workspaceDir(workspaceID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, safeName(threadID)+transcriptExt)
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}

	handle := &openFile{file: file, writer: bufio.NewWriterSize(file, 32*1024)}
	s.open[key] = handle
	return handle, nil
}

// Flush pushes buffered events for a workspace to disk. Called when a turn ends
// so a session that is merely idle is already durable.
func (s *Store) Flush(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	prefix := workspaceID + "/"
	var firstErr error
	for key, handle := range s.open {
		if workspaceID != "" && !strings.HasPrefix(key, prefix) {
			continue
		}
		if err := handle.writer.Flush(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// Close flushes and releases every open transcript.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var firstErr error
	for key, handle := range s.open {
		if err := handle.writer.Flush(); err != nil && firstErr == nil {
			firstErr = err
		}
		if err := handle.file.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
		delete(s.open, key)
	}
	return firstErr
}

// List reports every stored workspace, newest first.
//
// Reads only meta.json per workspace: the panel shows titles and timestamps, and
// loading transcripts here would mean reading every event ever recorded to draw
// a list.
func (s *Store) List() ([]Meta, error) {
	if s.disabled {
		return nil, nil
	}
	entries, err := os.ReadDir(s.root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	out := make([]Meta, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		meta, err := s.LoadMeta(entry.Name())
		if err != nil {
			// A directory without readable metadata is a partial write from a
			// crash; skipping it keeps the rest of history usable.
			continue
		}
		out = append(out, meta)
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].Workspace.UpdatedAt > out[j].Workspace.UpdatedAt
	})
	return out, nil
}

// Load reads a whole workspace back: metadata plus every transcript in it.
func (s *Store) Load(workspaceID string) (Session, error) {
	var loaded Session
	// Buffered writes would otherwise be missing from a session reopened in the
	// same run that produced it.
	_ = s.Flush(workspaceID)

	meta, err := s.LoadMeta(workspaceID)
	if err != nil {
		return loaded, err
	}
	loaded.Meta = meta
	loaded.Transcripts = make(map[string][]domain.RuntimeEvent)

	dir := s.workspaceDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return loaded, err
	}

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, transcriptExt) {
			continue
		}
		events, err := readTranscript(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		threadID := strings.TrimSuffix(name, transcriptExt)
		loaded.Transcripts[threadID] = events
	}
	return loaded, nil
}

// Delete removes a workspace and everything recorded under it.
func (s *Store) Delete(workspaceID string) error {
	if s.disabled || workspaceID == "" {
		return nil
	}

	s.mu.Lock()
	prefix := workspaceID + "/"
	for key, handle := range s.open {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		_ = handle.writer.Flush()
		_ = handle.file.Close()
		delete(s.open, key)
		delete(s.counts, key)
	}
	s.mu.Unlock()

	return os.RemoveAll(s.workspaceDir(workspaceID))
}

// readTranscript parses a JSONL transcript, tolerating a truncated final line.
//
// A crash mid-write leaves a partial line; dropping it recovers everything
// before it rather than failing the whole read.
func readTranscript(path string) ([]domain.RuntimeEvent, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	events := make([]domain.RuntimeEvent, 0, 256)
	reader := bufio.NewReaderSize(file, 64*1024)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			trimmed := strings.TrimSpace(string(line))
			if trimmed != "" {
				var event domain.RuntimeEvent
				if json.Unmarshal([]byte(trimmed), &event) == nil {
					events = append(events, event)
				}
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return events, err
		}
	}
	return events, nil
}

// writeAtomic replaces a file via a temp file and rename, so a reader never
// observes a half-written document.
func writeAtomic(path string, payload []byte) error {
	temp := path + ".tmp"
	if err := os.WriteFile(temp, payload, 0o644); err != nil {
		return err
	}
	if err := os.Rename(temp, path); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

// safeName keeps generated ids from escaping the history tree or colliding with
// path syntax. Ids are app-generated, but they end up as filenames, and a thread
// id is not worth trusting with a path separator.
func safeName(id string) string {
	var b strings.Builder
	b.Grow(len(id))
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	name := b.String()
	if name == "" || name == "." || name == ".." {
		return "_"
	}
	if len(name) > 96 {
		name = name[:96]
	}
	return name
}
