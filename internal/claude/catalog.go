package claude

import (
	"strconv"
	"strings"

	"catalyst/internal/domain"
)

// The Claude CLI cannot enumerate its own models, so the catalog is static and
// gated on the installed version. Effort tiers differ per model, which is the
// part `claude --help` does not expose.
type catalogEntry struct {
	id          string
	displayName string
	minVersion  string
	efforts     []string
	defEffort   string
	fastMode    bool
	thinking    bool
	contextWide bool
}

var claudeCatalog = []catalogEntry{
	{
		id: "claude-fable-5", displayName: "Claude Fable 5", minVersion: "2.1.169",
		efforts: []string{"low", "medium", "high", "xhigh", "max"}, defEffort: "high",
		contextWide: true,
	},
	{
		id: "claude-opus-5", displayName: "Claude Opus 5", minVersion: "2.1.219",
		efforts: []string{"low", "medium", "high", "xhigh", "max"}, defEffort: "high",
		fastMode: true, contextWide: true,
	},
	{
		id: "claude-sonnet-5", displayName: "Claude Sonnet 5",
		efforts: []string{"low", "medium", "high", "xhigh", "max"}, defEffort: "high",
		contextWide: true,
	},
	{
		id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5",
		thinking: true,
	},
}

var effortLabels = map[string]string{
	"low": "Low", "medium": "Medium", "high": "High", "xhigh": "Extra High", "max": "Max",
}

func (e catalogEntry) toModel() domain.Model {
	model := domain.Model{ID: e.id, DisplayName: e.displayName}

	if len(e.efforts) > 0 {
		choices := make([]domain.OptionChoice, 0, len(e.efforts))
		for _, effort := range e.efforts {
			choices = append(choices, domain.OptionChoice{
				ID: effort, Label: effortLabels[effort], Default: effort == e.defEffort,
			})
		}
		model.Options = append(model.Options, domain.OptionDescriptor{
			ID: domain.OptionEffort, Label: "Reasoning", Type: domain.OptionSelect,
			Choices: choices, Default: e.defEffort,
		})
	}

	if e.thinking {
		model.Options = append(model.Options, domain.OptionDescriptor{
			ID: domain.OptionThinking, Label: "Thinking", Type: domain.OptionBoolean, Default: false,
		})
	}
	if e.fastMode {
		model.Options = append(model.Options, domain.OptionDescriptor{
			ID: domain.OptionFastMode, Label: "Fast Mode", Type: domain.OptionBoolean, Default: false,
		})
	}
	if e.contextWide {
		model.Options = append(model.Options, domain.OptionDescriptor{
			ID: domain.OptionContextWindow, Label: "Context Window", Type: domain.OptionSelect,
			Choices: []domain.OptionChoice{
				{ID: "200k", Label: "200k"},
				{ID: "1m", Label: "1M", Default: true},
			},
			Default: "1m",
		})
	}
	return model
}

// Models returns the catalog filtered to what the installed CLI supports.
func Models(version string) []domain.Model {
	out := make([]domain.Model, 0, len(claudeCatalog))
	for _, entry := range claudeCatalog {
		if entry.minVersion != "" && compareVersions(version, entry.minVersion) < 0 {
			continue
		}
		model := entry.toModel()
		model.Default = entry.id == "claude-opus-5"
		out = append(out, model)
	}
	return out
}

// ResolveModelID applies the context-window option, which Claude Code selects
// by rewriting the model id rather than via a flag.
func ResolveModelID(model string, options domain.ModelOptions) string {
	if options.String(domain.OptionContextWindow) == "1m" {
		return model + "[1m]"
	}
	return model
}

func compareVersions(a, b string) int {
	aParts, bParts := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(aParts) || i < len(bParts); i++ {
		av, bv := versionPart(aParts, i), versionPart(bParts, i)
		if av != bv {
			if av < bv {
				return -1
			}
			return 1
		}
	}
	return 0
}

func versionPart(parts []string, index int) int {
	if index >= len(parts) {
		return 0
	}
	digits := parts[index]
	for i, r := range digits {
		if r < '0' || r > '9' {
			digits = digits[:i]
			break
		}
	}
	value, _ := strconv.Atoi(digits)
	return value
}
