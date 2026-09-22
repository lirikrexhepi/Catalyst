package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"composer/internal/domain"
)

// TaskListener is invoked whenever a session's tasklist changes.
type TaskListener func(sessionID string, plan []domain.PlanEntry)

type TaskService struct {
	repo     domain.TaskRepository
	mu       sync.RWMutex
	listener TaskListener
}

func NewTaskService(repo domain.TaskRepository) *TaskService {
	return &TaskService{repo: repo}
}

func (s *TaskService) SetListener(l TaskListener) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listener = l
}

func (s *TaskService) notify(sessionID string) {
	s.mu.RLock()
	listener := s.listener
	s.mu.RUnlock()

	if listener == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	tasks, err := s.repo.ListBySession(ctx, sessionID)
	if err != nil {
		return
	}
	plan := make([]domain.PlanEntry, len(tasks))
	for i, t := range tasks {
		plan[i] = domain.PlanEntry{
			Content:  t.Content,
			Status:   t.Status,
			Priority: t.Priority,
		}
	}
	listener(sessionID, plan)
}

func (s *TaskService) SetTasks(ctx context.Context, sessionID string, items []string) error {
	cleanSessionID := strings.TrimSpace(sessionID)
	if cleanSessionID == "" {
		return fmt.Errorf("session ID is required")
	}

	records := make([]domain.TaskRecord, 0, len(items))
	sid := cleanSessionID
	for i, item := range items {
		cleanItem := strings.TrimSpace(item)
		if cleanItem == "" {
			continue
		}
		records = append(records, domain.TaskRecord{
			SessionID:  &sid,
			Content:    cleanItem,
			Status:     "pending",
			Priority:   "normal",
			OrderIndex: i,
			Source:     "agent",
		})
	}

	if err := s.repo.SetSessionTasks(ctx, cleanSessionID, records); err != nil {
		return err
	}
	s.notify(cleanSessionID)
	return nil
}

func (s *TaskService) AddTask(ctx context.Context, sessionID string, item string) error {
	cleanSessionID := strings.TrimSpace(sessionID)
	cleanItem := strings.TrimSpace(item)
	if cleanSessionID == "" || cleanItem == "" {
		return fmt.Errorf("session ID and task content are required")
	}

	sid := cleanSessionID
	_, err := s.repo.AddTask(ctx, domain.TaskRecord{
		SessionID: &sid,
		Content:   cleanItem,
		Status:    "pending",
		Priority:  "normal",
		Source:    "agent",
	})
	if err != nil {
		return err
	}
	s.notify(cleanSessionID)
	return nil
}

func (s *TaskService) StartTask(ctx context.Context, sessionID string, target string) error {
	cleanSessionID := strings.TrimSpace(sessionID)
	if err := s.repo.UpdateStatusBySessionAndTarget(ctx, cleanSessionID, target, "in_progress"); err != nil {
		return err
	}
	s.notify(cleanSessionID)
	return nil
}

func (s *TaskService) DoneTask(ctx context.Context, sessionID string, target string) error {
	cleanSessionID := strings.TrimSpace(sessionID)
	if err := s.repo.UpdateStatusBySessionAndTarget(ctx, cleanSessionID, target, "done"); err != nil {
		return err
	}
	s.notify(cleanSessionID)
	return nil
}

func (s *TaskService) RemoveTask(ctx context.Context, sessionID string, target string) error {
	cleanSessionID := strings.TrimSpace(sessionID)
	if err := s.repo.RemoveTaskBySessionAndTarget(ctx, cleanSessionID, target); err != nil {
		return err
	}
	s.notify(cleanSessionID)
	return nil
}

func (s *TaskService) ListPlanEntries(ctx context.Context, sessionID string) ([]domain.PlanEntry, error) {
	tasks, err := s.repo.ListBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	plan := make([]domain.PlanEntry, len(tasks))
	for i, t := range tasks {
		plan[i] = domain.PlanEntry{
			Content:  t.Content,
			Status:   t.Status,
			Priority: t.Priority,
		}
	}
	return plan, nil
}

func (s *TaskService) ListTasks(ctx context.Context, sessionID string) ([]domain.TaskRecord, error) {
	return s.repo.ListBySession(ctx, sessionID)
}


