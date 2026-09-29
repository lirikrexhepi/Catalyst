package remote

import (
	"encoding/json"
	"net/http"
)

type PCStats struct {
	CPUPercent       float64 `json:"cpuPercent"`
	CPUCores         int     `json:"cpuCores"`
	MemoryUsedBytes  uint64  `json:"memoryUsedBytes"`
	MemoryTotalBytes uint64  `json:"memoryTotalBytes"`
	MemoryPercent    float64 `json:"memoryPercent"`
	UptimeSeconds    uint64  `json:"uptimeSeconds"`
}

func (s *Server) handlePCStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stats := getSystemStats()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}
