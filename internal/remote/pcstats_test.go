package remote

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlePCStats(t *testing.T) {
	s := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/api/pc/stats", nil)
	w := httptest.NewRecorder()

	s.handlePCStats(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var stats PCStats
	if err := json.Unmarshal(w.Body.Bytes(), &stats); err != nil {
		t.Fatalf("failed to decode PC stats: %v", err)
	}

	if stats.CPUCores <= 0 {
		t.Errorf("expected CPU cores > 0, got %d", stats.CPUCores)
	}
	if stats.MemoryTotalBytes <= 0 {
		t.Errorf("expected memory total > 0, got %d", stats.MemoryTotalBytes)
	}
	t.Logf("Tested PC stats: CPU=%.1f%% (%d cores), Memory=%.1f%% (%d MB / %d MB), Uptime=%ds",
		stats.CPUPercent, stats.CPUCores, stats.MemoryPercent,
		stats.MemoryUsedBytes/(1024*1024), stats.MemoryTotalBytes/(1024*1024), stats.UptimeSeconds)
}
