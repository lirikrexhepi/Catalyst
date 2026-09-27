package remote

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"composer/internal/domain"
	"composer/internal/history"
	"composer/internal/session"
)

type snapshotBody struct {
	Events  []domain.RuntimeEvent `json:"events"`
	LastSeq uint64                `json:"lastSeq"`
}

func fetchSnapshot(t *testing.T, s *Server, threadID string) snapshotBody {
	t.Helper()
	rec := httptest.NewRecorder()
	s.handleThread(rec, httptest.NewRequest(http.MethodGet, "/api/thread/"+threadID, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var body snapshotBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return body
}

func historyServer(t *testing.T) (*Server, *session.Manager) {
	t.Helper()
	store := history.New(t.TempDir())
	recorder := history.NewRecorder(store)
	t.Cleanup(func() { _ = recorder.Close() })
	recorder.TrackTask(domain.Task{ID: "t-1", WorkspaceID: "ws-1", ThreadID: "thread-a", Title: "Old chat", Driver: domain.DriverClaude})
	for i, kind := range []domain.EventKind{domain.EventUserMessage, domain.EventTurnStarted, domain.EventAgentMessage, domain.EventTurnCompleted} {
		recorder.Record("thread-a", domain.RuntimeEvent{
			Kind: kind, ThreadID: "thread-a", TurnID: "old-turn", Text: "earlier", Seq: uint64(2300 + i), At: int64(1000 + i),
		})
	}
	manager := session.NewManager(nil)
	manager.SetRecorder(recorder)
	return NewServer(0, manager, nil, nil, nil, nil, recorder, store), manager
}

func TestHistoryThreadSnapshotDoesNotClaimStaleSeqs(t *testing.T) {
	s, _ := historyServer(t)
	body := fetchSnapshot(t, s, "thread-a")
	if len(body.Events) != 4 {
		t.Fatalf("got %d events, want the 4 stored ones", len(body.Events))
	}
	if body.LastSeq != 0 {
		t.Fatalf("lastSeq = %d, want 0 so the phone keeps every live event of this run", body.LastSeq)
	}
}

func TestResumedThreadSnapshotKeepsStoredHistoryOnce(t *testing.T) {
	s, manager := historyServer(t)
	manager.RecordUserMessage("thread-a", "new-turn", "hello again")

	body := fetchSnapshot(t, s, "thread-a")
	if len(body.Events) != 5 {
		t.Fatalf("got %d events, want 4 stored + 1 live without duplicates: %+v", len(body.Events), body.Events)
	}
	if body.Events[0].TurnID != "old-turn" || body.Events[4].Text != "hello again" {
		t.Fatalf("events out of order: %+v", body.Events)
	}
	if body.LastSeq != body.Events[4].Seq || body.LastSeq >= 2300 {
		t.Fatalf("lastSeq = %d, want the live seq %d", body.LastSeq, body.Events[4].Seq)
	}
}

func TestJoinTranscriptsFallsBackToTime(t *testing.T) {
	stored := []domain.RuntimeEvent{
		{Kind: domain.EventUserMessage, TurnID: "a", At: 10},
		{Kind: domain.EventTurnCompleted, TurnID: "a", At: 20},
		{Kind: domain.EventUserMessage, TurnID: "b", At: 30},
	}
	live := []domain.RuntimeEvent{{Kind: domain.EventSessionStarted, At: 30}, {Kind: domain.EventUserMessage, TurnID: "b", At: 31}}
	got := joinTranscripts(stored, live)
	if len(got) != 4 || got[1].TurnID != "a" || got[2].Kind != domain.EventSessionStarted {
		t.Fatalf("joined = %+v", got)
	}
	if same := joinTranscripts(live, live); len(same) != len(live) {
		t.Fatalf("a transcript joined with itself grew to %d events", len(same))
	}
}
