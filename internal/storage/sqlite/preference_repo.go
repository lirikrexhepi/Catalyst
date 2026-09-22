package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

type PreferenceRepo struct {
	db *DB
}

func NewPreferenceRepo(db *DB) *PreferenceRepo {
	return &PreferenceRepo{db: db}
}

func (r *PreferenceRepo) Get(ctx context.Context, key string) (string, error) {
	var val string
	err := r.db.db.QueryRowContext(ctx, "SELECT value FROM user_preferences WHERE key = ?;", key).Scan(&val)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("failed to get preference %s: %w", key, err)
	}
	return val, nil
}

func (r *PreferenceRepo) Set(ctx context.Context, key string, value string) error {
	query := `
		INSERT INTO user_preferences (key, value, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at;
	`
	_, err := r.db.db.ExecContext(ctx, query, key, value, time.Now())
	if err != nil {
		return fmt.Errorf("failed to set preference %s: %w", key, err)
	}
	return nil
}

func (r *PreferenceRepo) All(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.db.QueryContext(ctx, "SELECT key, value FROM user_preferences;")
	if err != nil {
		return nil, fmt.Errorf("failed to list preferences: %w", err)
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		result[k] = v
	}
	return result, rows.Err()
}
