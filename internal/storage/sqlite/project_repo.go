package sqlite

import (
	"context"
	"fmt"
	"time"

	"composer/internal/domain"
)

type ProjectRepo struct {
	db *DB
}

func NewProjectRepo(db *DB) *ProjectRepo {
	return &ProjectRepo{db: db}
}

func (r *ProjectRepo) Upsert(ctx context.Context, p domain.ProjectRecord) error {
	now := time.Now()
	if p.CreatedAt.IsZero() {
		p.CreatedAt = now
	}
	if p.LastOpenedAt.IsZero() {
		p.LastOpenedAt = now
	}

	isGit := 0
	if p.IsGit {
		isGit = 1
	}

	query := `
		INSERT INTO projects (path, name, is_git, last_opened_at, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			name = excluded.name,
			is_git = excluded.is_git,
			last_opened_at = excluded.last_opened_at;
	`
	_, err := r.db.db.ExecContext(ctx, query, p.Path, p.Name, isGit, p.LastOpenedAt, p.CreatedAt)
	if err != nil {
		return fmt.Errorf("failed to upsert project %s: %w", p.Path, err)
	}
	return nil
}

func (r *ProjectRepo) List(ctx context.Context) ([]domain.ProjectRecord, error) {
	query := `
		SELECT path, name, is_git, last_opened_at, created_at
		FROM projects ORDER BY last_opened_at DESC;
	`
	rows, err := r.db.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}
	defer rows.Close()

	var result []domain.ProjectRecord
	for rows.Next() {
		var p domain.ProjectRecord
		var isGit int
		if err := rows.Scan(&p.Path, &p.Name, &isGit, &p.LastOpenedAt, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.IsGit = isGit == 1
		result = append(result, p)
	}
	return result, rows.Err()
}

func (r *ProjectRepo) Delete(ctx context.Context, path string) error {
	_, err := r.db.db.ExecContext(ctx, "DELETE FROM projects WHERE path = ?;", path)
	if err != nil {
		return fmt.Errorf("failed to delete project %s: %w", path, err)
	}
	return nil
}
