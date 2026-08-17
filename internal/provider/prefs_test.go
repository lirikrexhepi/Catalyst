package provider

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"catalyst/internal/domain"
)

func TestPreferredModelSurvivesRestart(t *testing.T) {
	dir := t.TempDir()

	prefs := NewPrefs(dir)
	if err := prefs.Set(domain.DriverClaude, domain.ProviderSettings{
		Model:   "claude-opus-5",
		Enabled: true,
	}); err != nil {
		t.Fatalf("Set: %v", err)
	}

	// A second store over the same directory stands in for the next app run.
	reopened := NewPrefs(dir)
	stored := reopened.All()
	if stored[domain.DriverClaude].Model != "claude-opus-5" {
		t.Fatalf("preferred model lost across restart: %+v", stored[domain.DriverClaude])
	}
}

func TestSetSettingsPersistsThroughRegistry(t *testing.T) {
	dir := t.TempDir()
	registry := NewRegistry(stubDriver{kind: domain.DriverClaude})
	registry.UsePrefs(NewPrefs(dir))

	if err := registry.SetSettings(domain.DriverClaude, domain.ProviderSettings{
		Model: "claude-sonnet-5",
	}); err != nil {
		t.Fatalf("SetSettings: %v", err)
	}

	// A fresh registry, as a later run would build.
	revived := NewRegistry(stubDriver{kind: domain.DriverClaude})
	revived.UsePrefs(NewPrefs(dir))
	if got := revived.Settings(domain.DriverClaude).Model; got != "claude-sonnet-5" {
		t.Fatalf("registry did not restore the saved model, got %q", got)
	}
}

func TestStoredSettingsForUnknownDriverAreIgnored(t *testing.T) {
	dir := t.TempDir()
	prefs := NewPrefs(dir)
	if err := prefs.Set("removed-provider", domain.ProviderSettings{Model: "ghost"}); err != nil {
		t.Fatalf("Set: %v", err)
	}

	// A settings file naming a provider this build no longer has must not
	// resurrect it into the registry.
	registry := NewRegistry(stubDriver{kind: domain.DriverClaude})
	registry.UsePrefs(NewPrefs(dir))
	if _, ok := registry.Driver("removed-provider"); ok {
		t.Fatal("a stale provider was revived from the settings file")
	}
}

func TestUnreadablePrefsFileStartsEmpty(t *testing.T) {
	dir := t.TempDir()
	// Corrupt file: losing preferences is acceptable, refusing to start is not.
	if err := os.WriteFile(filepath.Join(dir, prefsFile), []byte("{not json"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	prefs := NewPrefs(dir)
	if len(prefs.All()) != 0 {
		t.Fatalf("expected an empty store, got %+v", prefs.All())
	}
	if err := prefs.Set(domain.DriverClaude, domain.ProviderSettings{Model: "x"}); err != nil {
		t.Fatalf("a corrupt file must not block later writes: %v", err)
	}
}

// stubDriver is a minimal Driver so the registry can be exercised without a CLI.
type stubDriver struct{ kind domain.DriverKind }

func (s stubDriver) Kind() domain.DriverKind    { return s.kind }
func (s stubDriver) DisplayName() string        { return string(s.kind) }
func (s stubDriver) DefaultSettings() domain.ProviderSettings {
	return domain.ProviderSettings{Enabled: true}
}
func (s stubDriver) Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot {
	return domain.ProviderSnapshot{Availability: domain.AvailabilityReady}
}
func (s stubDriver) NewAdapter(settings domain.ProviderSettings, emit Emitter) (Adapter, error) {
	return nil, nil
}
