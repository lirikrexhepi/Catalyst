package provider

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"composer/internal/domain"
)

type Registry struct {
	mu       sync.RWMutex
	drivers  map[domain.DriverKind]Driver
	settings map[domain.DriverKind]domain.ProviderSettings
	cache    map[domain.DriverKind]domain.ProviderSnapshot

	// prefs persists settings between runs. Optional: without it the registry
	// behaves exactly as before and every existing test stays valid.
	prefs *Prefs

	accounts *Accounts
}

func (r *Registry) UseAccounts(accounts *Accounts) {
	r.mu.Lock()
	r.accounts = accounts
	r.cache = make(map[domain.DriverKind]domain.ProviderSnapshot, len(r.drivers))
	r.mu.Unlock()
}

func (r *Registry) AccountStore() *Accounts {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.accounts
}

func (r *Registry) SupportsAccounts(kind domain.DriverKind) bool {
	r.mu.RLock()
	driver, ok := r.drivers[kind]
	accounts := r.accounts
	r.mu.RUnlock()
	if !ok || accounts == nil {
		return false
	}
	_, ok = driver.(AccountDriver)
	return ok
}

func (r *Registry) Accounts(kind domain.DriverKind) []domain.Account {
	if !r.SupportsAccounts(kind) {
		return []domain.Account{{ID: domain.DefaultAccountID, Name: defaultAccountName}}
	}
	return r.AccountStore().List(kind)
}

func (r *Registry) Account(kind domain.DriverKind, id string) (domain.Account, bool) {
	id = domain.NormalizeAccount(id)
	for _, account := range r.Accounts(kind) {
		if account.ID == id {
			return account, true
		}
	}
	return domain.Account{}, false
}

func (r *Registry) ResolveAccount(kind domain.DriverKind, preferred ...string) string {
	for _, id := range preferred {
		if id == "" {
			continue
		}
		if _, ok := r.Account(kind, id); ok {
			return domain.NormalizeAccount(id)
		}
	}
	return domain.DefaultAccountID
}

func (r *Registry) LaunchSettings(kind domain.DriverKind, accountID string) (domain.ProviderSettings, error) {
	r.mu.RLock()
	driver, ok := r.drivers[kind]
	settings := r.settings[kind]
	r.mu.RUnlock()
	if !ok {
		return domain.ProviderSettings{}, fmt.Errorf("unknown provider %q", kind)
	}
	account, found := r.Account(kind, accountID)
	if !found {
		return domain.ProviderSettings{}, fmt.Errorf("%s account %q no longer exists", driver.DisplayName(), accountID)
	}
	return AccountSettings(settings, account, driver)
}

// UsePrefs attaches persistent storage and applies whatever was saved earlier,
// so a preferred model chosen in a previous run is in effect before the first
// probe runs.
func (r *Registry) UsePrefs(prefs *Prefs) {
	if prefs == nil {
		return
	}

	stored := prefs.All()
	r.mu.Lock()
	defer r.mu.Unlock()
	r.prefs = prefs
	for kind, settings := range stored {
		// Only for drivers this build knows about, so a stale file naming a
		// removed provider is ignored rather than resurrecting it.
		if _, ok := r.drivers[kind]; ok {
			r.settings[kind] = settings
		}
	}
}

func NewRegistry(drivers ...Driver) *Registry {
	r := &Registry{
		drivers:  make(map[domain.DriverKind]Driver, len(drivers)),
		settings: make(map[domain.DriverKind]domain.ProviderSettings, len(drivers)),
		cache:    make(map[domain.DriverKind]domain.ProviderSnapshot, len(drivers)),
	}
	for _, d := range drivers {
		r.drivers[d.Kind()] = d
		r.settings[d.Kind()] = d.DefaultSettings()
	}
	return r
}

func (r *Registry) Driver(kind domain.DriverKind) (Driver, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	d, ok := r.drivers[kind]
	return d, ok
}

func (r *Registry) Settings(kind domain.DriverKind) domain.ProviderSettings {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.settings[kind]
}

func (r *Registry) SetSettings(kind domain.DriverKind, settings domain.ProviderSettings) error {
	r.mu.Lock()
	if _, ok := r.drivers[kind]; !ok {
		r.mu.Unlock()
		return fmt.Errorf("unknown provider %q", kind)
	}
	r.settings[kind] = settings
	// Dropped so the next probe re-reads the CLI with the new settings; a
	// changed binary path or model would otherwise report stale results.
	delete(r.cache, kind)
	prefs := r.prefs
	r.mu.Unlock()

	if prefs == nil {
		return nil
	}
	return prefs.Set(kind, settings)
}

func (r *Registry) NewAdapter(kind domain.DriverKind, accountID string, emit Emitter) (Adapter, error) {
	settings, err := r.LaunchSettings(kind, accountID)
	if err != nil {
		return nil, err
	}
	r.mu.RLock()
	driver := r.drivers[kind]
	r.mu.RUnlock()
	return driver.NewAdapter(settings, emit)
}

const snapshotTTL = 30 * time.Second

// Probe checks every registered CLI concurrently. Results are cached briefly so
// repeated UI refreshes do not re-spawn version probes on every render.
func (r *Registry) Probe(ctx context.Context, force bool) []domain.ProviderSnapshot {
	r.mu.RLock()
	kinds := make([]domain.DriverKind, 0, len(r.drivers))
	for kind := range r.drivers {
		kinds = append(kinds, kind)
	}
	r.mu.RUnlock()

	out := make([]domain.ProviderSnapshot, len(kinds))
	var wg sync.WaitGroup
	for i, kind := range kinds {
		wg.Add(1)
		go func(i int, kind domain.DriverKind) {
			defer wg.Done()
			out[i] = r.probeOne(ctx, kind, force)
		}(i, kind)
	}
	wg.Wait()

	sort.Slice(out, func(i, j int) bool { return out[i].Driver < out[j].Driver })
	return out
}

func (r *Registry) probeOne(ctx context.Context, kind domain.DriverKind, force bool) domain.ProviderSnapshot {
	r.mu.RLock()
	driver := r.drivers[kind]
	settings := r.settings[kind]
	cached, hasCached := r.cache[kind]
	r.mu.RUnlock()

	if !force && hasCached && time.Since(time.UnixMilli(cached.CheckedAt)) < snapshotTTL {
		return r.withAccounts(kind, cached)
	}

	snapshot := driver.Probe(ctx, settings)
	snapshot.Driver = kind
	snapshot.DisplayName = driver.DisplayName()
	snapshot.CheckedAt = time.Now().UnixMilli()
	snapshot.Settings = settings

	r.mu.Lock()
	r.cache[kind] = snapshot
	r.mu.Unlock()
	return r.withAccounts(kind, snapshot)
}

func (r *Registry) withAccounts(kind domain.DriverKind, snapshot domain.ProviderSnapshot) domain.ProviderSnapshot {
	snapshot.Accounts = nil
	if r.SupportsAccounts(kind) {
		snapshot.Accounts = r.Accounts(kind)
	}
	return snapshot
}
