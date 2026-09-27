package remote

import (
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
)

var errPCSettingsUnavailable = errors.New("this setting is not available on this PC")

type MonitorStatus struct {
	Supported bool `json:"supported"`
	Count     int  `json:"count"`
	Off       bool `json:"off"`
	AutoOff   bool `json:"autoOff"`
}

type Diagnostics struct {
	Headless    bool     `json:"headless"`
	Port        int      `json:"port"`
	PublicURL   string   `json:"publicUrl,omitempty"`
	Connecting  bool     `json:"connecting"`
	TunnelError string   `json:"tunnelError,omitempty"`
	Clients     int      `json:"clients"`
	Tailscale   bool     `json:"tailscale"`
	Cloudflared bool     `json:"cloudflared"`
	Log         []string `json:"log"`
}

type PCHooks struct {
	Monitors       func() MonitorStatus
	MonitorsOff    func() error
	SetMonitorsOff func(enabled bool) error
	RecentProblems func() []string
	Headless       func() bool
}

func (s *Server) handleMonitors(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks().PC
	if hooks.Monitors == nil {
		writeError(w, http.StatusServiceUnavailable, errPCSettingsUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, hooks.Monitors())
}

func (s *Server) handleMonitorsOff(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks().PC
	if r.Method != http.MethodPost || hooks.MonitorsOff == nil {
		writeError(w, http.StatusServiceUnavailable, errPCSettingsUnavailable)
		return
	}
	if err := hooks.MonitorsOff(); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, hooks.Monitors())
}

func (s *Server) handleMonitorsAuto(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks().PC
	if r.Method != http.MethodPost || hooks.SetMonitorsOff == nil {
		writeError(w, http.StatusServiceUnavailable, errPCSettingsUnavailable)
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := hooks.SetMonitorsOff(body.Enabled); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, hooks.Monitors())
}

func (s *Server) handleDiagnostics(w http.ResponseWriter, r *http.Request) {
	hooks := s.currentHooks().PC
	public, _, connecting, _, lastError := s.tunnel.Status("")
	_, tailscaleErr := exec.LookPath("tailscale")
	_, cloudflaredErr := exec.LookPath("cloudflared")
	report := Diagnostics{
		Port:        s.port,
		PublicURL:   public,
		Connecting:  connecting,
		TunnelError: lastError,
		Clients:     s.Info().ActiveClients,
		Tailscale:   tailscaleErr == nil,
		Cloudflared: cloudflaredErr == nil,
		Log:         []string{},
	}
	if hooks.Headless != nil {
		report.Headless = hooks.Headless()
	}
	if hooks.RecentProblems != nil {
		report.Log = hooks.RecentProblems()
	}
	writeJSON(w, http.StatusOK, report)
}
