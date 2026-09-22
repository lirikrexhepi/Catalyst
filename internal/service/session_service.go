package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"composer/internal/domain"
)

type SessionService struct {
	repo domain.SessionRepository
}

func NewSessionService(repo domain.SessionRepository) *SessionService {
	return &SessionService{repo: repo}
}

func (s *SessionService) CreateSession(ctx context.Context, id string, title string, projectPath string, driver string, model string, branch string) error {
	rec := domain.SessionRecord{
		ID:          id,
		Title:       title,
		ProjectPath: projectPath,
		Branch:      branch,
		Driver:      driver,
		Model:       model,
		Status:      "active",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	return s.repo.Save(ctx, rec)
}

func (s *SessionService) RenameSession(ctx context.Context, id string, customName string) error {
	cleanName := strings.TrimSpace(customName)
	if cleanName == "" {
		return fmt.Errorf("custom name cannot be empty")
	}
	return s.repo.Rename(ctx, id, cleanName)
}

func (s *SessionService) UpdateCLISession(ctx context.Context, id string, cliSessionID string) error {
	return s.repo.UpdateCLISession(ctx, id, cliSessionID)
}

func (s *SessionService) UpdateStatus(ctx context.Context, id string, status string) error {
	return s.repo.UpdateStatus(ctx, id, status)
}

func (s *SessionService) GetSession(ctx context.Context, id string) (*domain.SessionRecord, error) {
	return s.repo.Get(ctx, id)
}

func (s *SessionService) ListSessions(ctx context.Context, limit int) ([]domain.SessionRecord, error) {
	return s.repo.List(ctx, limit)
}

func (s *SessionService) DeleteSession(ctx context.Context, id string) error {
	return s.repo.Delete(ctx, id)
}
