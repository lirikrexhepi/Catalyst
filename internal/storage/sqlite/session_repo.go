package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"composer/internal/domain"
)

type SessionRepo struct {
	db *DB
}

func NewSessionRepo(db *DB) *SessionRepo {
	return &SessionRepo{db: db}
}

func (r *SessionRepo) Save(ctx context.Context, s domain.SessionRecord) error {
	now := time.Now()
	if s.CreatedAt.IsZero() {
		s.CreatedAt = now
	}
	s.UpdatedAt = now

	query := `
		INSERT INTO sessions (id, workspace_id, title, custom_name, project_path, branch, driver, model, cli_session_id, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			custom_name = COALESCE(excluded.custom_name, sessions.custom_name),
			project_path = excluded.project_path,
			branch = excluded.branch,
			driver = excluded.driver,
			model = excluded.model,
			cli_session_id = COALESCE(excluded.cli_session_id, sessions.cli_session_id),
			status = excluded.status,
			updated_at = excluded.updated_at;
	`
	_, err := r.db.db.ExecContext(ctx, query,
		s.ID,
		nullString(s.WorkspaceID),
		s.Title,
		nullString(s.CustomName),
		s.ProjectPath,
		nullString(s.Branch),
		s.Driver,
		s.Model,
		nullString(s.CLISessionID),
		s.Status,
		s.CreatedAt,
		s.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to save session %s: %w", s.ID, err)
	}
	return nil
}

func (r *SessionRepo) Get(ctx context.Context, id string) (*domain.SessionRecord, error) {
	query := `
		SELECT id, workspace_id, title, custom_name, project_path, branch, driver, model, cli_session_id, status, created_at, updated_at
		FROM sessions WHERE id = ?;
	`
	row := r.db.db.QueryRowContext(ctx, query, id)

	var s domain.SessionRecord
	var wsID, cName, branch, cliID sql.NullString

	err := row.Scan(
		&s.ID,
		&wsID,
		&s.Title,
		&cName,
		&s.ProjectPath,
		&branch,
		&s.Driver,
		&s.Model,
		&cliID,
		&s.Status,
		&s.CreatedAt,
		&s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get session %s: %w", id, err)
	}

	s.WorkspaceID = wsID.String
	s.CustomName = cName.String
	s.Branch = branch.String
	s.CLISessionID = cliID.String
	return &s, nil
}

func (r *SessionRepo) Rename(ctx context.Context, id string, customName string) error {
	query := `UPDATE sessions SET custom_name = ?, updated_at = ? WHERE id = ?;`
	res, err := r.db.db.ExecContext(ctx, query, customName, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to rename session %s: %w", id, err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("session not found: %s", id)
	}
	return nil
}

func (r *SessionRepo) UpdateCLISession(ctx context.Context, id string, cliSessionID string) error {
	query := `UPDATE sessions SET cli_session_id = ?, updated_at = ? WHERE id = ?;`
	_, err := r.db.db.ExecContext(ctx, query, cliSessionID, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update CLI session for %s: %w", id, err)
	}
	return nil
}

func (r *SessionRepo) UpdateStatus(ctx context.Context, id string, status string) error {
	query := `UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?;`
	_, err := r.db.db.ExecContext(ctx, query, status, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update status for %s: %w", id, err)
	}
	return nil
}

func (r *SessionRepo) List(ctx context.Context, limit int) ([]domain.SessionRecord, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT id, workspace_id, title, custom_name, project_path, branch, driver, model, cli_session_id, status, created_at, updated_at
		FROM sessions ORDER BY updated_at DESC LIMIT ?;
	`
	rows, err := r.db.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []domain.SessionRecord
	for rows.Next() {
		var s domain.SessionRecord
		var wsID, cName, branch, cliID sql.NullString
		if err := rows.Scan(
			&s.ID,
			&wsID,
			&s.Title,
			&cName,
			&s.ProjectPath,
			&branch,
			&s.Driver,
			&s.Model,
			&cliID,
			&s.Status,
			&s.CreatedAt,
			&s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan session row: %w", err)
		}
		s.WorkspaceID = wsID.String
		s.CustomName = cName.String
		s.Branch = branch.String
		s.CLISessionID = cliID.String
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

func (r *SessionRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.db.ExecContext(ctx, "DELETE FROM sessions WHERE id = ?;", id)
	if err != nil {
		return fmt.Errorf("failed to delete session %s: %w", id, err)
	}
	return nil
}

func nullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
