package claude

import "strings"

type ModelUsage struct {
	ContextWindow int64 `json:"contextWindow,omitempty"`
}

const (
	defaultContextWindow  = 200_000
	extendedContextWindow = 1_000_000
)

func (s *session) noteModel(model string) {
	if model == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runningModel = model
}

func (s *session) noteContextWindow(window int64) {
	if window <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if window > s.contextWindow {
		s.contextWindow = window
	}
}

func (s *session) contextLimit() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.contextWindow > 0 {
		return s.contextWindow
	}
	model := s.runningModel
	if model == "" {
		model = ResolveModelID(s.model, s.options)
	}
	if strings.Contains(strings.ToLower(model), "[1m]") {
		return extendedContextWindow
	}
	return defaultContextWindow
}
