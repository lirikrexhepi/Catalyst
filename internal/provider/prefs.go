package provider

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"catalyst/internal/domain"
)

// prefsFile is where per-CLI settings live between runs.
const prefsFile = "providers.json"

// Prefs persists provider settings so a chosen default model survives a
// restart. Without it a "preferred model" would only last as long as the window
// was open, which is not a preference at all.
type Prefs struct {
	path string

	mu    sync.Mutex
	saved map[domain.DriverKind]domain.ProviderSettings
}

// NewPrefs opens the store at dir, loading anything already written there.
//
// A store that cannot read its file starts empty rather than failing: settings
// are a convenience, and losing them must never stop the app from starting.
func NewPrefs(dir string) *Prefs {
	prefs := &Prefs{
		path:  filepath.Join(dir, prefsFile),
		saved: make(map[domain.DriverKind]domain.ProviderSettings),
	}

	payload, err := os.ReadFile(prefs.path)
	if err != nil {
		return prefs
	}
	var stored map[domain.DriverKind]domain.ProviderSettings
	if json.Unmarshal(payload, &stored) == nil {
		prefs.saved = stored
	}
	return prefs
}

// All reports every stored setting.
func (p *Prefs) All() map[domain.DriverKind]domain.ProviderSettings {
	p.mu.Lock()
	defer p.mu.Unlock()

	out := make(map[domain.DriverKind]domain.ProviderSettings, len(p.saved))
	for kind, settings := range p.saved {
		out[kind] = settings
	}
	return out
}

// Set records one provider's settings and writes the file.
func (p *Prefs) Set(kind domain.DriverKind, settings domain.ProviderSettings) error {
	p.mu.Lock()
	p.saved[kind] = settings
	payload, err := json.MarshalIndent(p.saved, "", "  ")
	p.mu.Unlock()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(p.path), 0o755); err != nil {
		return err
	}
	// Written via a temp file so a crash mid-write cannot leave settings
	// unreadable and reset every provider to its default.
	temp := p.path + ".tmp"
	if err := os.WriteFile(temp, payload, 0o644); err != nil {
		return err
	}
	if err := os.Rename(temp, p.path); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}
