package remote

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"composer/internal/domain"
	"composer/internal/files"
	"composer/internal/projects"
)

// WorkspaceHooks are the app-level operations behind the phone's project
// screens. The app owns which folders may be opened; the phone only asks.
type WorkspaceHooks struct {
	GitOverview   func(ctx context.Context, project string) ([]domain.WorktreeChanges, error)
	GitFileDiff   func(ctx context.Context, checkout, file string, staged bool) (domain.DiffFile, error)
	GitCommitDiff func(ctx context.Context, checkout, sha string) ([]domain.DiffFile, error)
	Tree          func(ctx context.Context, root, dir string) ([]files.Entry, error)
	TreeStatus    func(ctx context.Context, root string) (files.TreeStatus, error)
	ReadFile      func(ctx context.Context, root, path string) (files.Content, error)
	AddProject    func(ctx context.Context, path string) (projects.Project, error)
}

var errUnavailable = errors.New("not available on this version of the desktop app")

func (s *Server) registerWorkspaceRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/git/overview", s.requireAuth(s.handleGitOverview))
	mux.HandleFunc("/api/git/diff", s.requireAuth(s.handleGitDiff))
	mux.HandleFunc("/api/git/commit", s.requireAuth(s.handleGitCommit))
	mux.HandleFunc("/api/tree", s.requireAuth(s.handleTree))
	mux.HandleFunc("/api/tree/status", s.requireAuth(s.handleTreeStatus))
	mux.HandleFunc("/api/file", s.requireAuth(s.handleFile))
	mux.HandleFunc("/api/folders", s.requireAuth(s.handleFolders))
	mux.HandleFunc("/api/projects/add", s.requireAuth(s.handleAddProject))
}

func (s *Server) workspace() WorkspaceHooks {
	return s.currentHooks().Workspace
}

func (s *Server) handleGitOverview(w http.ResponseWriter, r *http.Request) {
	hook := s.workspace().GitOverview
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	lanes, err := hook(r.Context(), r.URL.Query().Get("project"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if lanes == nil {
		lanes = []domain.WorktreeChanges{}
	}
	writeJSON(w, http.StatusOK, lanes)
}

func (s *Server) handleGitDiff(w http.ResponseWriter, r *http.Request) {
	hook := s.workspace().GitFileDiff
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	q := r.URL.Query()
	diff, err := hook(r.Context(), q.Get("checkout"), q.Get("file"), q.Get("staged") == "1")
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, diff)
}

func (s *Server) handleGitCommit(w http.ResponseWriter, r *http.Request) {
	hook := s.workspace().GitCommitDiff
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	q := r.URL.Query()
	diffs, err := hook(r.Context(), q.Get("checkout"), q.Get("sha"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if diffs == nil {
		diffs = []domain.DiffFile{}
	}
	writeJSON(w, http.StatusOK, diffs)
}

func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
	hook := s.workspace().Tree
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	q := r.URL.Query()
	entries, err := hook(r.Context(), q.Get("root"), q.Get("dir"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if entries == nil {
		entries = []files.Entry{}
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) handleTreeStatus(w http.ResponseWriter, r *http.Request) {
	hook := s.workspace().TreeStatus
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	status, err := hook(r.Context(), r.URL.Query().Get("root"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	hook := s.workspace().ReadFile
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	q := r.URL.Query()
	content, err := hook(r.Context(), q.Get("root"), q.Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, content)
}

// handleFolders drives the phone's folder picker. With no path it returns
// the starting places (home, drives); with one, that folder's sub-folders.
// The picker can see any folder the desktop user can, which is no more than
// an agent started from the phone could already reach.
func (s *Server) handleFolders(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSON(w, http.StatusOK, map[string]any{"places": files.Places()})
		return
	}
	folder, err := files.Browse(path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folder": folder})
}

func (s *Server) handleAddProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	hook := s.workspace().AddProject
	if hook == nil {
		writeError(w, http.StatusNotImplemented, errUnavailable)
		return
	}
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&body); err != nil || body.Path == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "send {\"path\": \"...\"}"})
		return
	}
	project, err := hook(r.Context(), body.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, project)
}
