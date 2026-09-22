package service

import (
	"context"
	"path/filepath"
	"testing"

	"composer/internal/domain"
	"composer/internal/storage/sqlite"
)

func TestTaskService(t *testing.T) {
	dir := t.TempDir()
	db, err := sqlite.Open(filepath.Join(dir, "service_test.db"))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	taskRepo := sqlite.NewTaskRepo(db)
	taskService := NewTaskService(taskRepo)

	var notifiedSession string
	var notifiedLen int
	taskService.SetListener(func(sessionID string, plan []domain.PlanEntry) {
		notifiedSession = sessionID
		notifiedLen = len(plan)
	})

	sessID := "sess-svc-1"
	sessionRepo := sqlite.NewSessionRepo(db)
	_ = sessionRepo.Save(ctx, domain.SessionRecord{
		ID:          sessID,
		Title:       "Test Session",
		ProjectPath: "C:/test",
		Driver:      "claude",
		Model:       "claude-opus-5",
		Status:      "active",
	})

	// Set tasks
	err = taskService.SetTasks(ctx, sessID, []string{"Build UI", "Run migrations", "Ship feature"})
	if err != nil {
		t.Fatalf("SetTasks failed: %v", err)
	}
	if notifiedSession != sessID || notifiedLen != 3 {
		t.Errorf("listener not notified correctly: sess=%s, len=%d", notifiedSession, notifiedLen)
	}

	// Start task
	err = taskService.StartTask(ctx, sessID, "Run migrations")
	if err != nil {
		t.Fatalf("StartTask failed: %v", err)
	}

	plan, err := taskService.ListPlanEntries(ctx, sessID)
	if err != nil || len(plan) != 3 {
		t.Fatalf("ListPlanEntries failed: %v", err)
	}
	if plan[1].Status != "in_progress" {
		t.Errorf("expected plan[1] in_progress, got %s", plan[1].Status)
	}

	// Done task
	err = taskService.DoneTask(ctx, sessID, "1") // by 1-based index
	if err != nil {
		t.Fatalf("DoneTask failed: %v", err)
	}
	plan, _ = taskService.ListPlanEntries(ctx, sessID)
	if plan[0].Status != "done" {
		t.Errorf("expected plan[0] done, got %s", plan[0].Status)
	}
}

func TestSessionService(t *testing.T) {
	dir := t.TempDir()
	db, err := sqlite.Open(filepath.Join(dir, "sess_svc_test.db"))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	sessionRepo := sqlite.NewSessionRepo(db)
	sessionService := NewSessionService(sessionRepo)

	err = sessionService.CreateSession(ctx, "th-1", "Initial title", "C:/test", "claude", "claude-opus-5", "main")
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	got, err := sessionService.GetSession(ctx, "th-1")
	if err != nil || got == nil {
		t.Fatalf("GetSession failed: %v", err)
	}
	if got.Title != "Initial title" {
		t.Errorf("expected title 'Initial title', got %s", got.Title)
	}

	err = sessionService.RenameSession(ctx, "th-1", "Billing System Refactor")
	if err != nil {
		t.Fatalf("RenameSession failed: %v", err)
	}

	gotRenamed, _ := sessionService.GetSession(ctx, "th-1")
	if gotRenamed.CustomName != "Billing System Refactor" || gotRenamed.DisplayName() != "Billing System Refactor" {
		t.Errorf("expected custom name 'Billing System Refactor', got %s", gotRenamed.DisplayName())
	}
}
