package remote

import (
	"fmt"
	"time"

	"composer/internal/domain"
	"composer/internal/logger"
)

const (
	awakeCheckInterval = 5 * time.Second
	awakeCoolOff       = 5 * time.Minute
)

// HasRunningWork reports whether any agent is currently actively processing a turn.
func (s *Server) HasRunningWork() (bool, string) {
	if s.orchestrator != nil {
		for _, a := range s.orchestrator.ListAgents() {
			if a.State == domain.TaskRunning {
				title := a.Title
				if len([]rune(title)) > 30 {
					title = string([]rune(title)[:30]) + "…"
				}
				return true, fmt.Sprintf("agent %q is running", title)
			}
		}
	}
	return false, ""
}

func (s *Server) wantAwake() (bool, string) {
	// 1. If any agent is actively running: ALWAYS keep the PC awake!
	if running, reason := s.HasRunningWork(); running {
		s.mu.Lock()
		s.lastWorkAt = time.Now()
		s.mu.Unlock()
		return true, reason
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	// 2. Cooldown period after an agent finishes: keep the PC awake so the user has time
	// to see the result and follow up before the PC enters sleep or hibernation.
	if !s.lastWorkAt.IsZero() && time.Since(s.lastWorkAt) < awakeCoolOff {
		return true, "cooldown period after agent completed work"
	}

	// 3. Keep awake if a phone has keepAwake enabled.
	// We keep awake if the phone is currently visible, OR if it reported
	// keepAwake and was active recently within the grace period.
	for _, p := range s.presence {
		if p.keepAwake {
			if p.visible && time.Since(p.at) < presenceTTL {
				return true, "phone app is open with keep-awake enabled"
			}
			if !p.lastVisible.IsZero() && time.Since(p.lastVisible) < awakeCoolOff {
				return true, "phone app keep-awake grace period"
			}
		}
	}
	return false, ""
}

func (s *Server) updateAwake() {
	want, reason := s.wantAwake()
	s.applyAwake(want, reason)
}

func (s *Server) applyAwake(on bool, reasons ...string) {
	changed, err := s.awake.set(on)
	if err != nil {
		logger.Errorf("RemoteServer", "Could not change the keep-awake request: %v", err)
		return
	}
	if !changed {
		return
	}
	reason := ""
	if len(reasons) > 0 {
		reason = reasons[0]
	}
	if on {
		if reason != "" {
			logger.Infof("RemoteServer", "Keeping the PC awake (%s)", reason)
		} else {
			logger.Infof("RemoteServer", "Keeping the PC awake")
		}
	} else {
		if reason != "" {
			logger.Infof("RemoteServer", "Releasing keep-awake: %s; normal sleep settings apply again", reason)
		} else {
			logger.Infof("RemoteServer", "All agent work complete and no active phones; the PC's normal sleep settings apply again")
		}
	}
}

func (s *Server) watchAwake(stop <-chan struct{}) {
	ticker := time.NewTicker(awakeCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			s.updateAwake()
		}
	}
}
