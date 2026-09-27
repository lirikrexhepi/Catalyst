package main

import (
	"context"
	"sync"
	"time"

	"composer/internal/claude"
	"composer/internal/domain"
	"composer/internal/logger"
	"composer/internal/projects"
	"composer/internal/provider"
	"composer/internal/session"
)

type AccountAdded struct {
	Account domain.Account `json:"account"`
	Copied  []string       `json:"copied,omitempty"`
	Warning string         `json:"warning,omitempty"`
}

type accountQuotas struct {
	mu      sync.Mutex
	sources map[string]*claude.QuotaSource
}

func (a *App) ListAccounts(driver string) []domain.Account {
	return a.registry.Accounts(domain.DriverKind(driver))
}

func (a *App) AddAccount(driver, name string, copySettings bool) (AccountAdded, error) {
	kind := domain.DriverKind(driver)
	store := a.registry.AccountStore()
	if store == nil || !a.registry.SupportsAccounts(kind) {
		return AccountAdded{}, provider.ErrAccountsUnsupport
	}
	account, err := store.Add(kind, name)
	if err != nil {
		return AccountAdded{}, err
	}
	logger.Infof("Accounts", "Added %s account %q at %s", kind, account.Name, account.ConfigDir)
	result := AccountAdded{Account: account}
	if copySettings {
		copied, err := a.registry.CopyDefaultSettings(kind, account.ID)
		result.Copied = copied
		if err != nil {
			result.Warning = "Some settings could not be copied: " + err.Error()
		}
	}
	return result, nil
}

func (a *App) CopyAccountSettings(driver, id string) ([]string, error) {
	return a.registry.CopyDefaultSettings(domain.DriverKind(driver), id)
}

func (a *App) RenameAccount(driver, id, name string) error {
	store := a.registry.AccountStore()
	if store == nil {
		return provider.ErrAccountsUnsupport
	}
	return store.Rename(domain.DriverKind(driver), id, name)
}

func (a *App) RemoveAccount(driver, id string) error {
	store := a.registry.AccountStore()
	if store == nil {
		return provider.ErrAccountsUnsupport
	}
	if err := store.Remove(domain.DriverKind(driver), id); err != nil {
		return err
	}
	if a.accountQuota != nil {
		a.accountQuota.mu.Lock()
		delete(a.accountQuota.sources, id)
		a.accountQuota.mu.Unlock()
	}
	a.usage.Forget(domain.DriverKind(driver), id)
	return nil
}

func (a *App) AccountStatus(driver, id string) (provider.AccountStatus, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return a.registry.AccountStatus(ctx, domain.DriverKind(driver), id)
}

func (a *App) SignInAccount(driver, id string) error {
	command, err := a.registry.SignInCommand(domain.DriverKind(driver), id)
	if err != nil {
		return err
	}
	logger.Infof("Accounts", "Opening a sign-in terminal for %s account %s", driver, id)
	return openTerminal(command)
}

func (a *App) SetProjectAccount(projectID, driver, account string) (*projects.Project, error) {
	kind := domain.DriverKind(driver)
	if account != "" {
		if _, ok := a.registry.Account(kind, account); !ok {
			return nil, provider.ErrAccountNotFound
		}
		if domain.NormalizeAccount(account) == domain.DefaultAccountID {
			account = ""
		}
	}
	project, err := a.projects.SetAccount(projectID, driver, account)
	if err != nil {
		return nil, err
	}
	a.emit(projectsChangedChannel)
	return &project, nil
}

func (a *App) accountLabel(driver domain.DriverKind, id string) string {
	label := domain.DriverLabel(driver)
	accounts := a.registry.Accounts(driver)
	if len(accounts) < 2 {
		return label
	}
	if account, ok := a.registry.Account(driver, id); ok {
		return label + " · " + account.Name
	}
	return label
}

func (a *App) refreshAccountQuotas(force bool) {
	if a.accountQuota == nil {
		return
	}
	for _, account := range a.registry.Accounts(domain.DriverClaude) {
		if account.IsDefault() || account.ConfigDir == "" {
			continue
		}
		source := a.accountQuotaSource(account)
		if force {
			source.Invalidate()
		}
		limits, fetchedAt, err := source.Snapshot()
		a.usage.SetAccountLimits(domain.DriverClaude, account.ID, limits, fetchedAt)
		if err != nil {
			a.usage.SetAccountQuotaError(domain.DriverClaude, account.ID, err.Error())
		}
	}
}

func (a *App) accountQuotaSource(account domain.Account) *claude.QuotaSource {
	a.accountQuota.mu.Lock()
	defer a.accountQuota.mu.Unlock()
	if source, ok := a.accountQuota.sources[account.ID]; ok {
		return source
	}
	source := claude.NewAccountQuotaSource(account.ConfigDir)
	source.OnUpdate(func() {
		a.emit(quotaChangedChannel)
	})
	a.accountQuota.sources[account.ID] = source
	return source
}

func (a *App) nameUsage(report session.UsageReport) session.UsageReport {
	for i := range report.Drivers {
		entry := &report.Drivers[i]
		accounts := a.registry.Accounts(entry.Driver)
		if len(accounts) < 2 {
			continue
		}
		if account, ok := a.registry.Account(entry.Driver, entry.Account); ok {
			entry.AccountName = account.Name
		}
	}
	return report
}
