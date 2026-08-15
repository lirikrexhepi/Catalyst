package antigravity

import (
	"sort"
	"strings"

	"catalyst/internal/domain"
)

// agy bakes the effort tier into the model id (`gemini-3.7-flash-high`) rather
// than exposing a separate flag. Listed ids are therefore folded back into one
// model per family with an `effort` select, so the UI matches the other
// providers instead of showing a long flat list.
var effortSuffixes = []struct {
	suffix string
	id     string
	label  string
}{
	{"-high", "high", "High"},
	{"-medium", "medium", "Medium"},
	{"-low", "low", "Low"},
}

type family struct {
	base     string
	name     string
	efforts  []domain.OptionChoice
	thinking bool
}

// ParseModels turns `agy models` output into grouped models. Each line is
// "<id>\t<display name>".
func ParseModels(stdout string) []domain.Model {
	order := make([]string, 0, 16)
	families := make(map[string]*family)

	for _, line := range strings.Split(stdout, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Fetching") {
			continue
		}

		id, display, _ := strings.Cut(line, "\t")
		id = strings.TrimSpace(id)
		display = strings.TrimSpace(display)
		if id == "" {
			continue
		}
		if display == "" {
			display = id
		}

		base, effort, label := splitEffort(id)
		name := baseDisplayName(display)

		entry, seen := families[base]
		if !seen {
			entry = &family{base: base, name: name}
			families[base] = entry
			order = append(order, base)
		}
		if strings.Contains(strings.ToLower(display), "thinking") {
			entry.thinking = true
		}
		if effort != "" {
			entry.efforts = append(entry.efforts, domain.OptionChoice{
				ID: effort, Label: label, Default: effort == "medium",
			})
		}
	}

	out := make([]domain.Model, 0, len(order))
	for _, base := range order {
		entry := families[base]
		model := domain.Model{ID: entry.base, DisplayName: entry.name}

		if len(entry.efforts) > 0 {
			sortEfforts(entry.efforts)
			ensureDefault(entry.efforts)
			model.Options = append(model.Options, domain.OptionDescriptor{
				ID: domain.OptionEffort, Label: "Reasoning", Type: domain.OptionSelect,
				Choices: entry.efforts, Default: defaultChoice(entry.efforts),
			})
		}
		out = append(out, model)
	}
	return out
}

var effortRank = map[string]int{"low": 0, "medium": 1, "high": 2}

// sortEfforts orders tiers low→high; `agy models` lists them high-first.
func sortEfforts(choices []domain.OptionChoice) {
	sort.SliceStable(choices, func(i, j int) bool {
		return effortRank[choices[i].ID] < effortRank[choices[j].ID]
	})
}

// SplitModelSelection separates the base model id from its effort tier.
//
// agy carries the tier in two places — fused into listed ids
// (`gemini-3.7-flash-high`) and as a `--effort` flag — so a selection may hold
// it in either, and tiered families reject a bare `--model`. Every tiered model
// in the catalog advertises a default choice, so a UI-driven selection always
// supplies one; nothing is inferred from the id here.
func SplitModelSelection(model string, options domain.ModelOptions) (string, string) {
	base, suffixEffort, _ := splitEffort(model)

	if effort := options.String(domain.OptionEffort); effort != "" {
		return base, effort
	}
	return base, suffixEffort
}

func splitEffort(id string) (base, effort, label string) {
	for _, candidate := range effortSuffixes {
		if strings.HasSuffix(id, candidate.suffix) {
			return strings.TrimSuffix(id, candidate.suffix), candidate.id, candidate.label
		}
	}
	return id, "", ""
}

func baseDisplayName(display string) string {
	if idx := strings.Index(display, " ("); idx > 0 {
		return display[:idx]
	}
	return display
}

func ensureDefault(choices []domain.OptionChoice) {
	for _, choice := range choices {
		if choice.Default {
			return
		}
	}
	choices[0].Default = true
}

func defaultChoice(choices []domain.OptionChoice) string {
	for _, choice := range choices {
		if choice.Default {
			return choice.ID
		}
	}
	return ""
}
