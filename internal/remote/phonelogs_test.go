package remote

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPhoneLogStoreIngestAndRecent(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "phonelog_test_*")
	if err != nil {
		t.Fatalf("MkdirTemp failed: %v", err)
	}
	defer os.RemoveAll(tempDir)

	store := newPhoneLogStore(tempDir)

	items := []PhoneLogItem{
		{
			Timestamp: time.Now().UnixMilli(),
			Level:     "info",
			Message:   "Connected to PC",
			Details:   map[string]any{"rtt": 45},
		},
		{
			Timestamp: time.Now().UnixMilli(),
			Level:     "warn",
			Message:   "Visibility hidden",
		},
		{
			Timestamp: time.Now().UnixMilli(),
			Level:     "error",
			Message:   "WebSocket disconnect code 1006",
			Details:   map[string]any{"code": 1006},
		},
	}

	store.Ingest(items, "test-phone")

	recent := store.Recent()
	if len(recent) != 3 {
		t.Fatalf("expected 3 recent logs, got %d", len(recent))
	}
	if recent[0].Message != "Connected to PC" {
		t.Errorf("unexpected first message: %s", recent[0].Message)
	}
	if recent[2].Level != "error" {
		t.Errorf("unexpected third level: %s", recent[2].Level)
	}

	// Verify file was written
	content, err := os.ReadFile(filepath.Join(tempDir, "phone_debug.log"))
	if err != nil {
		t.Fatalf("failed to read phone_debug.log: %v", err)
	}
	if !bytes.Contains(content, []byte("WebSocket disconnect code 1006")) {
		t.Errorf("log file does not contain expected message")
	}
}

func TestPhoneLogsHTTPEndpoint(t *testing.T) {
	s := &Server{
		phoneLogs: newPhoneLogStore(""),
		auth:      NewAuthManager(),
	}

	// 1. POST phone logs
	payload := PhoneLogsPayload{
		DeviceID: "iPhone15",
		Logs: []PhoneLogItem{
			{
				Timestamp: time.Now().UnixMilli(),
				Level:     "info",
				Message:   "Test log message",
			},
		},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/phone/logs", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handlePhoneLogs(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("POST /api/phone/logs status %d, want 200", w.Code)
	}

	// 2. GET phone logs
	reqGet := httptest.NewRequest(http.MethodGet, "/api/phone/logs", nil)
	wGet := httptest.NewRecorder()
	s.handlePhoneLogs(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("GET /api/phone/logs status %d, want 200", wGet.Code)
	}

	var logs []PhoneLogItem
	if err := json.Unmarshal(wGet.Body.Bytes(), &logs); err != nil {
		t.Fatalf("failed to parse GET response: %v", err)
	}
	if len(logs) != 1 || logs[0].Message != "Test log message" {
		t.Errorf("unexpected logs in GET response: %+v", logs)
	}
}
