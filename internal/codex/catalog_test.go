package codex

import (
	"testing"

	"composer/internal/domain"
)

func TestCatalogDefaultAndEfforts(t *testing.T) {
	models := Models()
	if len(models) != 8 {
		t.Fatalf("codex catalog has %d models, want 8", len(models))
	}
	defaults := 0
	for i := range models {
		if models[i].Default {
			defaults++
			if models[i].ID != "gpt-6.1-sol" {
				t.Fatalf("default model = %q, want gpt-6.1-sol", models[i].ID)
			}
		}
	}
	if defaults != 1 {
		t.Fatalf("want exactly one default model, got %d", defaults)
	}
	byID := map[string]domain.Model{}
	for _, m := range models {
		byID[m.ID] = m
	}
	terra, ok := byID["gpt-5.6-terra"]
	if !ok {
		t.Fatalf("gpt-5.6-terra missing from catalog")
	}
	found := false
	for _, option := range terra.Options {
		if option.ID != domain.OptionEffort {
			continue
		}
		found = true
		if def, _ := option.Default.(string); def != "medium" {
			t.Fatalf("gpt-5.6-terra default effort = %v, want medium", option.Default)
		}
		if len(option.Choices) != 6 {
			t.Fatalf("gpt-5.6-terra has %d effort choices, want 6", len(option.Choices))
		}
	}
	if !found {
		t.Fatalf("gpt-5.6-terra advertises no effort option")
	}
}

func TestResolveEffortPrefersSelection(t *testing.T) {
	if got := ResolveEffort(domain.ModelOptions{domain.OptionEffort: "high"}, "medium"); got != "high" {
		t.Fatalf("ResolveEffort = %q, want high", got)
	}
	if got := ResolveEffort(domain.ModelOptions{}, "medium"); got != "medium" {
		t.Fatalf("ResolveEffort fallback = %q, want medium", got)
	}
}
