package remote

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"composer/internal/logger"
)

// PhoneLogItem represents a log entry sent by the mobile client.
type PhoneLogItem struct {
	ID        string         `json:"id,omitempty"`
	Timestamp int64          `json:"timestamp"`
	Level     string         `json:"level"` // "info", "warn", "error", "debug"
	Message   string         `json:"message"`
	Details   map[string]any `json:"details,omitempty"`
}

// PhoneLogsPayload is the JSON payload sent by the phone client.
type PhoneLogsPayload struct {
	DeviceID string         `json:"deviceId,omitempty"`
	Logs     []PhoneLogItem `json:"logs"`
}

type phoneLogStore struct {
	mu       sync.RWMutex
	filePath string
	recent   []PhoneLogItem
	limit    int
}

func newPhoneLogStore(storageDir string) *phoneLogStore {
	var filePath string
	if storageDir != "" {
		filePath = filepath.Join(storageDir, "phone_debug.log")
	}
	return &phoneLogStore{
		filePath: filePath,
		recent:   make([]PhoneLogItem, 0, 200),
		limit:    200,
	}
}

func (s *phoneLogStore) setStorageDir(storageDir string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if storageDir != "" {
		s.filePath = filepath.Join(storageDir, "phone_debug.log")
	}
}

func (s *phoneLogStore) Ingest(batch []PhoneLogItem, source string) {
	if len(batch) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	var file *os.File
	if s.filePath != "" {
		var err error
		file, err = os.OpenFile(s.filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err == nil {
			defer file.Close()
		}
	}

	for _, item := range batch {
		if item.Timestamp <= 0 {
			item.Timestamp = time.Now().UnixMilli()
		}
		if item.Level == "" {
			item.Level = "info"
		}

		s.recent = append(s.recent, item)
		if len(s.recent) > s.limit {
			s.recent = s.recent[len(s.recent)-s.limit:]
		}

		detailsStr := ""
		if len(item.Details) > 0 {
			if b, err := json.Marshal(item.Details); err == nil {
				detailsStr = " " + string(b)
			}
		}

		prefix := "Phone"
		msg := fmt.Sprintf("[%s] %s%s", item.Level, item.Message, detailsStr)
		switch item.Level {
		case "error":
			logger.Errorf(prefix, "%s", msg)
		case "warn":
			logger.Warnf(prefix, "%s", msg)
		default:
			logger.Infof(prefix, "%s", msg)
		}

		if file != nil {
			t := time.UnixMilli(item.Timestamp).Format("2006-01-02 15:04:05.000")
			src := ""
			if source != "" {
				src = fmt.Sprintf(" [%s]", source)
			}
			line := fmt.Sprintf("[%s] [%-5s]%s %s%s\n", t, item.Level, src, item.Message, detailsStr)
			_, _ = file.WriteString(line)
		}
	}
}

func (s *phoneLogStore) Recent() []PhoneLogItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]PhoneLogItem, len(s.recent))
	copy(out, s.recent)
	return out
}
