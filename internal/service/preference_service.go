package service

import (
	"context"

	"composer/internal/domain"
)

type PreferenceService struct {
	prefRepo     domain.PreferenceRepository
	providerRepo domain.ProviderRepository
}

func NewPreferenceService(prefRepo domain.PreferenceRepository, providerRepo domain.ProviderRepository) *PreferenceService {
	return &PreferenceService{
		prefRepo:     prefRepo,
		providerRepo: providerRepo,
	}
}

func (s *PreferenceService) Get(ctx context.Context, key string) (string, error) {
	return s.prefRepo.Get(ctx, key)
}

func (s *PreferenceService) Set(ctx context.Context, key string, value string) error {
	return s.prefRepo.Set(ctx, key, value)
}

func (s *PreferenceService) All(ctx context.Context) (map[string]string, error) {
	return s.prefRepo.All(ctx)
}

func (s *PreferenceService) GetPreferredModel(ctx context.Context, providerID string) (string, error) {
	p, err := s.providerRepo.Get(ctx, providerID)
	if err != nil || p == nil {
		return "", err
	}
	return p.PreferredModel, nil
}

func (s *PreferenceService) SetPreferredModel(ctx context.Context, providerID string, modelID string) error {
	return s.providerRepo.SetPreferredModel(ctx, providerID, modelID)
}

func (s *PreferenceService) SetPermission(ctx context.Context, providerID string, enabled bool) error {
	return s.providerRepo.SetPermission(ctx, providerID, enabled)
}

func (s *PreferenceService) IsProviderEnabled(ctx context.Context, providerID string) (bool, error) {
	p, err := s.providerRepo.Get(ctx, providerID)
	if err != nil || p == nil {
		// By default disabled since we need their permission
		return false, nil
	}
	return p.IsEnabled, nil
}
