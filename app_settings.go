package main

import (
	"context"
	"fmt"

	"composer/internal/domain"
	"composer/internal/session"
)

// UsageReport returns per-CLI token spend for this app run plus current
// subscription quota.
//
// Quota comes from a source that refreshes in the background, matching how each
// CLI's own settings view behaves: opening the panel shows current figures
// without an agent having to run first, and without waiting on a request.
func (a *App) UsageReport() session.UsageReport {
	a.refreshQuota()
	return a.usage.Report()
}

// refreshQuota pulls limits from every CLI whose quota Composer can reach.
//
// Only Claude's is reachable: it is fetched from the account with the OAuth
// token the CLI stores, falling back to that CLI's own on-disk cache.
// Antigravity refreshes its token and quota in memory for the lifetime of a CLI
// process and writes neither to disk, so there is nothing to read and no way to
// authenticate a fetch without impersonating its OAuth client. Its quota stays
// in its own settings UI.
func (a *App) refreshQuota() {
	limits, fetchedAt, err := a.quota.Snapshot()
	a.usage.SetLimits(domain.DriverClaude, limits, fetchedAt)
	if err != nil {
		a.usage.SetQuotaError(domain.DriverClaude, err.Error())
	}
}

// RefreshUsage forces quota to be re-fetched rather than served from the
// freshness window, for when the panel is opened.
//
// The figures it returns are the ones already held: the fetch it starts runs in
// the background and announces itself over quotaChangedChannel when it lands, so
// opening the panel paints immediately instead of waiting on the network.
func (a *App) RefreshUsage() session.UsageReport {
	a.quota.Invalidate()
	return a.UsageReport()
}

func (a *App) ListProviders(force bool) []domain.ProviderSnapshot {
	return a.registry.Probe(a.ctx, force)
}

func (a *App) GetProviderSettings(driver string) domain.ProviderSettings {
	return a.registry.Settings(domain.DriverKind(driver))
}

func (a *App) UpdateProviderSettings(driver string, settings domain.ProviderSettings) error {
	if a.prefService != nil {
		if settings.Model != "" {
			_ = a.prefService.SetPreferredModel(a.ctx, driver, settings.Model)
		}
		_ = a.prefService.SetPermission(a.ctx, driver, settings.Enabled)
	}
	return a.registry.SetSettings(domain.DriverKind(driver), settings)
}

// RenameSession updates the user-defined custom name of an agent session.
func (a *App) RenameSession(threadID string, customName string) error {
	if a.sessionService == nil {
		return fmt.Errorf("database session service not initialized")
	}
	return a.sessionService.RenameSession(a.ctx, threadID, customName)
}

// GetSessionMeta returns the SQLite session record for a thread ID.
func (a *App) GetSessionMeta(threadID string) (*domain.SessionRecord, error) {
	if a.sessionService == nil {
		return nil, fmt.Errorf("database session service not initialized")
	}
	return a.sessionService.GetSession(a.ctx, threadID)
}

// ListSessionsMeta lists recent sessions stored in SQLite.
func (a *App) ListSessionsMeta(limit int) ([]domain.SessionRecord, error) {
	if a.sessionService == nil {
		return nil, fmt.Errorf("database session service not initialized")
	}
	return a.sessionService.ListSessions(a.ctx, limit)
}

// GetSessionTasks returns the current task list for a session.
func (a *App) GetSessionTasks(sessionID string) ([]domain.TaskRecord, error) {
	if a.taskService == nil {
		return nil, fmt.Errorf("database task service not initialized")
	}
	return a.taskService.ListTasks(a.ctx, sessionID)
}

// SetUserPreference persists a key-value setting in SQLite.
func (a *App) SetUserPreference(key string, value string) error {
	if a.prefService == nil {
		return fmt.Errorf("preference service not initialized")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.prefService.Set(ctx, key, value)
}

// GetUserPreference retrieves a key-value setting from SQLite.
func (a *App) GetUserPreference(key string) (string, error) {
	if a.prefService == nil {
		return "", fmt.Errorf("preference service not initialized")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.prefService.Get(ctx, key)
}

// GetAllUserPreferences retrieves all key-value settings from SQLite.
func (a *App) GetAllUserPreferences() (map[string]string, error) {
	if a.prefService == nil {
		return nil, fmt.Errorf("preference service not initialized")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.prefService.All(ctx)
}

// SetProviderPermission updates permission (enabled/disabled) for an agent provider.
func (a *App) SetProviderPermission(providerID string, enabled bool) error {
	if a.prefService == nil {
		return fmt.Errorf("preference service not initialized")
	}
	return a.prefService.SetPermission(a.ctx, providerID, enabled)
}

// IsProviderEnabled checks if a given agent provider is enabled.
func (a *App) IsProviderEnabled(providerID string) (bool, error) {
	if a.prefService == nil {
		return true, nil
	}
	return a.prefService.IsProviderEnabled(a.ctx, providerID)
}
