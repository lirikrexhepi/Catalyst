package provider

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"catalyst/internal/domain"
)

type Registry struct {
	mu       sync.RWMutex
	drivers  map[domain.DriverKind]Driver
	settings map[domain.DriverKind]domain.ProviderSettings
	cache    map[domain.DriverKind]domain.ProviderSnapshot
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
	defer r.mu.Unlock()
	if _, ok := r.drivers[kind]; !ok {
		return fmt.Errorf("unknown provider %q", kind)
	}
	r.settings[kind] = settings
	delete(r.cache, kind)
	return nil
}

func (r *Registry) NewAdapter(kind domain.DriverKind, emit Emitter) (Adapter, error) {
	r.mu.RLock()
	driver, ok := r.drivers[kind]
	settings := r.settings[kind]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("unknown provider %q", kind)
	}
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
		return cached
	}

	snapshot := driver.Probe(ctx, settings)
	snapshot.Driver = kind
	snapshot.DisplayName = driver.DisplayName()
	snapshot.CheckedAt = time.Now().UnixMilli()

	r.mu.Lock()
	r.cache[kind] = snapshot
	r.mu.Unlock()
	return snapshot
}
