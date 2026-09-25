package opencode

import (
	"context"
	"net/http"
	"time"
)

type providerCatalog struct {
	Providers []struct {
		ID     string `json:"id"`
		Models map[string]struct {
			Limit struct {
				Context int64 `json:"context"`
			} `json:"limit"`
		} `json:"models"`
	} `json:"providers"`
}

const limitRefetchAfter = time.Minute

func (a *Adapter) contextLimit(t *thread, providerID, modelID string) int64 {
	if providerID == "" || modelID == "" || t.api == nil {
		return 0
	}
	key := providerID + "/" + modelID
	a.limitsMu.Lock()
	defer a.limitsMu.Unlock()
	if limit, ok := a.limits[t.serverKey][key]; ok {
		return limit
	}
	if a.limitsAt == nil {
		a.limitsAt = make(map[string]time.Time)
	}
	if time.Since(a.limitsAt[t.serverKey]) < limitRefetchAfter {
		return 0
	}
	a.limitsAt[t.serverKey] = time.Now()
	go a.fetchLimits(t.serverKey, t.api)
	return 0
}

func (a *Adapter) fetchLimits(serverKey string, api *httpClient) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var catalog providerCatalog
	if err := api.do(ctx, http.MethodGet, "/config/providers", nil, &catalog); err != nil {
		return
	}
	table := make(map[string]int64)
	for _, p := range catalog.Providers {
		for id, model := range p.Models {
			if model.Limit.Context > 0 {
				table[p.ID+"/"+id] = model.Limit.Context
			}
		}
	}
	a.limitsMu.Lock()
	defer a.limitsMu.Unlock()
	if a.limits == nil {
		a.limits = make(map[string]map[string]int64)
	}
	a.limits[serverKey] = table
}
