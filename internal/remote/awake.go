package remote

import (
	"time"

	"composer/internal/logger"
)

const awakeCheckInterval = 10 * time.Second

func (s *Server) wantAwake() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.presence {
		if p.visible && p.keepAwake && time.Since(p.at) < presenceTTL {
			return true
		}
	}
	return false
}

func (s *Server) updateAwake() {
	s.applyAwake(s.wantAwake())
}

func (s *Server) applyAwake(on bool) {
	changed, err := s.awake.set(on)
	if err != nil {
		logger.Errorf("RemoteServer", "Could not change the keep-awake request: %v", err)
		return
	}
	if !changed {
		return
	}
	if on {
		logger.Infof("RemoteServer", "Keeping the PC awake while the phone app is open")
	} else {
		logger.Infof("RemoteServer", "Phone app closed; the PC's normal sleep settings apply again")
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
