package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"composer/internal/domain"
)

type ProviderRepo struct {
	db *DB
}

func NewProviderRepo(db *DB) *ProviderRepo {
	return &ProviderRepo{db: db}
}

func (r *ProviderRepo) Save(ctx context.Context, p domain.ProviderRecord) error {
	p.UpdatedAt = time.Now()
	enabled := 0
	if p.IsEnabled {
		enabled = 1
	}

	query := `
		INSERT INTO providers (id, name, is_enabled, preferred_model, binary_path, permission_granted_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			is_enabled = excluded.is_enabled,
			preferred_model = COALESCE(excluded.preferred_model, providers.preferred_model),
			binary_path = COALESCE(excluded.binary_path, providers.binary_path),
			permission_granted_at = COALESCE(excluded.permission_granted_at, providers.permission_granted_at),
			updated_at = excluded.updated_at;
	`
	_, err := r.db.db.ExecContext(ctx, query,
		p.ID,
		p.Name,
		enabled,
		nullString(p.PreferredModel),
		nullString(p.BinaryPath),
		p.PermissionGrantedAt,
		p.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to save provider %s: %w", p.ID, err)
	}
	return nil
}

func (r *ProviderRepo) Get(ctx context.Context, id string) (*domain.ProviderRecord, error) {
	query := `
		SELECT id, name, is_enabled, preferred_model, binary_path, permission_granted_at, updated_at
		FROM providers WHERE id = ?;
	`
	row := r.db.db.QueryRowContext(ctx, query, id)

	var p domain.ProviderRecord
	var isEnabled int
	var prefModel, binPath sql.NullString
	var permTime sql.NullTime

	err := row.Scan(&p.ID, &p.Name, &isEnabled, &prefModel, &binPath, &permTime, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get provider %s: %w", id, err)
	}

	p.IsEnabled = isEnabled == 1
	p.PreferredModel = prefModel.String
	p.BinaryPath = binPath.String
	if permTime.Valid {
		p.PermissionGrantedAt = &permTime.Time
	}
	return &p, nil
}

func (r *ProviderRepo) SetPreferredModel(ctx context.Context, id string, modelID string) error {
	query := `
		INSERT INTO providers (id, name, is_enabled, preferred_model, updated_at)
		VALUES (?, ?, 1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			preferred_model = excluded.preferred_model,
			updated_at = excluded.updated_at;
	`
	_, err := r.db.db.ExecContext(ctx, query, id, id, modelID, time.Now())
	if err != nil {
		return fmt.Errorf("failed to update preferred model for provider %s: %w", id, err)
	}
	return nil
}

func (r *ProviderRepo) SetPermission(ctx context.Context, id string, enabled bool) error {
	val := 0
	var permTime sql.NullTime
	now := time.Now()
	if enabled {
		val = 1
		permTime = sql.NullTime{Time: now, Valid: true}
	}

	query := `
		INSERT INTO providers (id, name, is_enabled, permission_granted_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			is_enabled = excluded.is_enabled,
			permission_granted_at = COALESCE(excluded.permission_granted_at, providers.permission_granted_at),
			updated_at = excluded.updated_at;
	`
	_, err := r.db.db.ExecContext(ctx, query, id, id, val, permTime, now)
	if err != nil {
		return fmt.Errorf("failed to update permission for provider %s: %w", id, err)
	}
	return nil
}

func (r *ProviderRepo) List(ctx context.Context) ([]domain.ProviderRecord, error) {
	query := `
		SELECT id, name, is_enabled, preferred_model, binary_path, permission_granted_at, updated_at
		FROM providers ORDER BY name ASC;
	`
	rows, err := r.db.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list providers: %w", err)
	}
	defer rows.Close()

	var result []domain.ProviderRecord
	for rows.Next() {
		var p domain.ProviderRecord
		var isEnabled int
		var prefModel, binPath sql.NullString
		var permTime sql.NullTime

		if err := rows.Scan(&p.ID, &p.Name, &isEnabled, &prefModel, &binPath, &permTime, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan provider: %w", err)
		}
		p.IsEnabled = isEnabled == 1
		p.PreferredModel = prefModel.String
		p.BinaryPath = binPath.String
		if permTime.Valid {
			p.PermissionGrantedAt = &permTime.Time
		}
		result = append(result, p)
	}
	return result, rows.Err()
}
