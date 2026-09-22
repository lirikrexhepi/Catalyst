package remote

import (
	"encoding/json"
	"errors"
	"net/http"

	"composer/internal/servers"
)

var (
	errPreviewsUnavailable = errors.New("previews are not available")
	errPortRequired        = errors.New("port is required")
)

// PreviewServerView is one previewable dev server: what the desktop browser
// offers as a destination, plus the public tunnel carrying it to the phone.
type PreviewServerView struct {
	PID           int          `json:"pid"`
	Port          int          `json:"port"`
	Name          string       `json:"name"`
	Kind          string       `json:"kind"`
	OwnerThreadID string       `json:"ownerThreadId,omitempty"`
	Preview       *PreviewInfo `json:"preview,omitempty"`
}

type PreviewGroupView struct {
	ThreadID string              `json:"threadId,omitempty"`
	Title    string              `json:"title"`
	Servers  []PreviewServerView `json:"servers"`
}

// handleServers lists the machine's listening dev servers grouped by owning
// agent — the same scan that powers the desktop browser — with each server's
// public preview tunnel overlaid, so the phone can open the site it serves.
func (s *Server) handleServers(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks()
	var groups []servers.Group
	if hooks.Servers != nil {
		groups = hooks.Servers()
	}

	byPort := make(map[int]PreviewInfo)
	if s.previews != nil {
		for _, p := range s.previews.Snapshot() {
			byPort[p.Port] = p
		}
	}

	out := make([]PreviewGroupView, 0, len(groups))
	for _, g := range groups {
		view := PreviewGroupView{ThreadID: g.ThreadID, Title: g.Title, Servers: []PreviewServerView{}}
		for _, srv := range g.Servers {
			if srv.Agent || srv.Port <= 0 {
				continue
			}
			row := PreviewServerView{
				PID: srv.PID, Port: srv.Port, Name: srv.Name,
				Kind: srv.Kind, OwnerThreadID: srv.OwnerThreadID,
			}
			if p, ok := byPort[srv.Port]; ok {
				p := p
				row.Preview = &p
			}
			view.Servers = append(view.Servers, row)
		}
		if len(view.Servers) > 0 {
			out = append(out, view)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handlePreviewStart(w http.ResponseWriter, r *http.Request) {
	if s.previews == nil {
		writeError(w, http.StatusServiceUnavailable, errPreviewsUnavailable)
		return
	}
	var body struct {
		Port int `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Port <= 0 {
		writeError(w, http.StatusBadRequest, errPortRequired)
		return
	}
	info, err := s.previews.Start(body.Port)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handlePreviewStop(w http.ResponseWriter, r *http.Request) {
	if s.previews == nil {
		writeError(w, http.StatusServiceUnavailable, errPreviewsUnavailable)
		return
	}
	var body struct {
		Port int `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Port <= 0 {
		writeError(w, http.StatusBadRequest, errPortRequired)
		return
	}
	s.previews.Stop(body.Port)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
