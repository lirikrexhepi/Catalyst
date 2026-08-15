package drivers

import (
	"context"
	"strings"

	"catalyst/internal/antigravity"
	"catalyst/internal/claude"
	"catalyst/internal/codex"
	"catalyst/internal/domain"
	"catalyst/internal/opencode"
	"catalyst/internal/provider"
)

// All returns the built-in driver set. Registering a new agent CLI means adding
// one entry here plus its adapter package.
func All() []provider.Driver {
	return []provider.Driver{
		&claudeDriver{},
		&codexDriver{},
		&antigravityDriver{},
		&openCodeDriver{},
	}
}

func binaryFor(settings domain.ProviderSettings, fallback string) string {
	if settings.BinaryPath != "" {
		return settings.BinaryPath
	}
	return fallback
}

type claudeDriver struct{}

func (d *claudeDriver) Kind() domain.DriverKind { return domain.DriverClaude }
func (d *claudeDriver) DisplayName() string     { return "Claude Code" }

func (d *claudeDriver) DefaultSettings() domain.ProviderSettings {
	return domain.ProviderSettings{Enabled: true}
}

// Probe gates the static catalog on the installed CLI version, since the Claude
// CLI cannot enumerate its own models.
func (d *claudeDriver) Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot {
	snapshot := provider.ProbeVersion(ctx, binaryFor(settings, "claude"), settings)
	if snapshot.Availability == domain.AvailabilityReady {
		snapshot.Models = claude.Models(snapshot.Version)
	}
	return snapshot
}

func (d *claudeDriver) NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) (provider.Adapter, error) {
	return claude.NewAdapter(settings, emit), nil
}

type antigravityDriver struct{}

func (d *antigravityDriver) Kind() domain.DriverKind { return domain.DriverAntigravity }
func (d *antigravityDriver) DisplayName() string     { return "Antigravity" }

func (d *antigravityDriver) DefaultSettings() domain.ProviderSettings {
	return domain.ProviderSettings{Enabled: true}
}

func (d *antigravityDriver) Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot {
	binary := binaryFor(settings, "agy")
	snapshot := provider.ProbeVersion(ctx, binary, settings)
	if snapshot.Availability != domain.AvailabilityReady {
		return snapshot
	}
	if result := provider.RunCommand(ctx, binary, []string{"models"}, nil, ""); result.Err == nil {
		snapshot.Models = antigravity.ParseModels(result.Stdout)
	}
	return snapshot
}

func (d *antigravityDriver) NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) (provider.Adapter, error) {
	return antigravity.NewAdapter(settings, emit), nil
}

type codexDriver struct{}

func (d *codexDriver) Kind() domain.DriverKind { return domain.DriverCodex }
func (d *codexDriver) DisplayName() string     { return "Codex" }

func (d *codexDriver) DefaultSettings() domain.ProviderSettings {
	return domain.ProviderSettings{Enabled: true}
}

func (d *codexDriver) Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot {
	return provider.ProbeVersion(ctx, binaryFor(settings, "codex"), settings)
}

func (d *codexDriver) NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) (provider.Adapter, error) {
	return codex.NewAdapter(settings, emit), nil
}

type openCodeDriver struct{}

func (d *openCodeDriver) Kind() domain.DriverKind { return domain.DriverOpenCode }
func (d *openCodeDriver) DisplayName() string     { return "OpenCode" }

func (d *openCodeDriver) DefaultSettings() domain.ProviderSettings {
	return domain.ProviderSettings{Enabled: true}
}

func (d *openCodeDriver) Probe(ctx context.Context, settings domain.ProviderSettings) domain.ProviderSnapshot {
	// An external server needs no local binary, so availability is decided by
	// the configured URL rather than a version probe.
	if strings.TrimSpace(settings.ServerURL) != "" {
		return domain.ProviderSnapshot{
			Availability: domain.AvailabilityReady,
			Message:      "Using external server at " + settings.ServerURL,
		}
	}

	snapshot := provider.ProbeVersion(ctx, binaryFor(settings, "opencode"), settings)
	if snapshot.Availability == domain.AvailabilityReady {
		snapshot.Models = d.models(ctx, settings)
	}
	return snapshot
}

func (d *openCodeDriver) models(ctx context.Context, settings domain.ProviderSettings) []domain.Model {
	result := provider.RunCommand(ctx, binaryFor(settings, "opencode"), []string{"models"}, nil, "")
	if result.Err != nil {
		return nil
	}

	var models []domain.Model
	for _, line := range strings.Split(result.Stdout, "\n") {
		id := strings.TrimSpace(line)
		if id == "" || strings.HasPrefix(id, "#") {
			continue
		}
		models = append(models, domain.Model{ID: id, DisplayName: id})
	}
	return models
}

func (d *openCodeDriver) NewAdapter(settings domain.ProviderSettings, emit provider.Emitter) (provider.Adapter, error) {
	return opencode.NewAdapter(settings, emit), nil
}
