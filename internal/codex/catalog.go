package codex

import (
	"composer/internal/domain"
)

type catalogEntry struct {
	id          string
	displayName string
	efforts     []string
	defEffort   string
}

var codexCatalog = []catalogEntry{
	{
		id: "gpt-6.1-sol", displayName: "GPT-6.1 Sol",
		efforts: []string{"low", "medium", "high", "xhigh", "max", "ultra"}, defEffort: "low",
	},
	{
		id: "gpt-6-astra", displayName: "GPT-6-Astra",
		efforts: []string{"low", "medium", "high", "xhigh", "max", "ultra"}, defEffort: "low",
	},
	{
		id: "gpt-6-sol", displayName: "GPT-6-Sol",
		efforts: []string{"low", "medium", "high", "xhigh", "max", "ultra"}, defEffort: "medium",
	},
	{
		id: "gpt-6-luna", displayName: "GPT-6-Luna",
		efforts: []string{"low", "medium", "high", "xhigh", "max"}, defEffort: "medium",
	},
	{
		id: "gpt-5.6-sol", displayName: "GPT-5.6-Sol",
		efforts: []string{"low", "medium", "high", "xhigh", "max", "ultra"}, defEffort: "low",
	},
	{
		id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra",
		efforts: []string{"low", "medium", "high", "xhigh", "max", "ultra"}, defEffort: "medium",
	},
	{
		id: "gpt-5.6-luna", displayName: "GPT-5.6-Luna",
		efforts: []string{"low", "medium", "high", "xhigh", "max"}, defEffort: "medium",
	},
	{
		id: "gpt-5.5", displayName: "GPT-5.5",
		efforts: []string{"low", "medium", "high", "xhigh"}, defEffort: "medium",
	},
}

var codexEffortLabels = map[string]string{
	"low": "Low", "medium": "Medium", "high": "High",
	"xhigh": "Extra High", "max": "Max", "ultra": "Ultra",
}

func (e catalogEntry) toModel() domain.Model {
	model := domain.Model{ID: e.id, DisplayName: e.displayName}
	if len(e.efforts) > 0 {
		choices := make([]domain.OptionChoice, 0, len(e.efforts))
		for _, effort := range e.efforts {
			choices = append(choices, domain.OptionChoice{
				ID: effort, Label: codexEffortLabels[effort], Default: effort == e.defEffort,
			})
		}
		model.Options = append(model.Options, domain.OptionDescriptor{
			ID: domain.OptionEffort, Label: "Reasoning", Type: domain.OptionSelect,
			Choices: choices, Default: e.defEffort,
		})
	}
	return model
}

func Models() []domain.Model {
	out := make([]domain.Model, 0, len(codexCatalog))
	for _, entry := range codexCatalog {
		model := entry.toModel()
		model.Default = entry.id == "gpt-6.1-sol"
		out = append(out, model)
	}
	return out
}

func ResolveEffort(options domain.ModelOptions, fallback string) string {
	if effort := options.String(domain.OptionEffort); effort != "" {
		return effort
	}
	return fallback
}
