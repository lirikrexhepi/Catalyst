package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"composer/internal/domain"
)

type TaskRepo struct {
	db *DB
}

func NewTaskRepo(db *DB) *TaskRepo {
	return &TaskRepo{db: db}
}

// SetSessionTasks atomically replaces the tasks for a session.
// Used when composer-task set or initial plan breakdown replaces the tasklist.
func (r *TaskRepo) SetSessionTasks(ctx context.Context, sessionID string, tasks []domain.TaskRecord) error {
	tx, err := r.db.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM tasks WHERE session_id = ?;", sessionID); err != nil {
		return fmt.Errorf("failed to clear existing tasks for session %s: %w", sessionID, err)
	}

	insertQuery := `
		INSERT INTO tasks (session_id, content, status, priority, order_index, source, scheduled_at, started_at, completed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
	`
	stmt, err := tx.PrepareContext(ctx, insertQuery)
	if err != nil {
		return fmt.Errorf("failed to prepare insert task statement: %w", err)
	}
	defer stmt.Close()

	now := time.Now()
	for i, task := range tasks {
		if task.Priority == "" {
			task.Priority = "normal"
		}
		if task.Status == "" {
			task.Status = "pending"
		}
		if task.Source == "" {
			task.Source = "agent"
		}
		task.OrderIndex = i

		var completedAt sql.NullTime
		if task.Status == "done" {
			completedAt = sql.NullTime{Time: now, Valid: true}
		}

		_, err := stmt.ExecContext(ctx,
			sessionID,
			task.Content,
			task.Status,
			task.Priority,
			task.OrderIndex,
			task.Source,
			task.ScheduledAt,
			task.StartedAt,
			completedAt,
			now,
		)
		if err != nil {
			return fmt.Errorf("failed to insert task %d: %w", i, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit task replacement: %w", err)
	}
	return nil
}

func (r *TaskRepo) AddTask(ctx context.Context, task domain.TaskRecord) (int64, error) {
	now := time.Now()
	if task.CreatedAt.IsZero() {
		task.CreatedAt = now
	}
	if task.Priority == "" {
		task.Priority = "normal"
	}
	if task.Status == "" {
		task.Status = "pending"
	}
	if task.Source == "" {
		task.Source = "agent"
	}

	// Determine next order_index for session
	if task.SessionID != nil {
		var maxOrder sql.NullInt64
		_ = r.db.db.QueryRowContext(ctx, "SELECT MAX(order_index) FROM tasks WHERE session_id = ?;", *task.SessionID).Scan(&maxOrder)
		if maxOrder.Valid {
			task.OrderIndex = int(maxOrder.Int64) + 1
		}
	}

	query := `
		INSERT INTO tasks (session_id, content, status, priority, order_index, source, scheduled_at, started_at, completed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
	`
	res, err := r.db.db.ExecContext(ctx, query,
		task.SessionID,
		task.Content,
		task.Status,
		task.Priority,
		task.OrderIndex,
		task.Source,
		task.ScheduledAt,
		task.StartedAt,
		task.CompletedAt,
		task.CreatedAt,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to add task: %w", err)
	}
	return res.LastInsertId()
}

func (r *TaskRepo) UpdateStatus(ctx context.Context, taskID int64, status string) error {
	var completedAt sql.NullTime
	var startedAt sql.NullTime

	now := time.Now()
	if status == "done" || status == "completed" {
		completedAt = sql.NullTime{Time: now, Valid: true}
	} else if status == "in_progress" {
		startedAt = sql.NullTime{Time: now, Valid: true}
	}

	query := `
		UPDATE tasks SET status = ?,
			started_at = COALESCE(?, started_at),
			completed_at = ?
		WHERE id = ?;
	`
	_, err := r.db.db.ExecContext(ctx, query, status, startedAt, completedAt, taskID)
	if err != nil {
		return fmt.Errorf("failed to update task %d status: %w", taskID, err)
	}
	return nil
}

func (r *TaskRepo) UpdateStatusBySessionAndTarget(ctx context.Context, sessionID string, target string, status string) error {
	tasks, err := r.ListBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	idx := findTaskIndex(tasks, target)
	if idx < 0 || idx >= len(tasks) {
		return fmt.Errorf("task matching '%s' not found in session %s", target, sessionID)
	}
	return r.UpdateStatus(ctx, tasks[idx].ID, status)
}

func (r *TaskRepo) RemoveTask(ctx context.Context, taskID int64) error {
	_, err := r.db.db.ExecContext(ctx, "DELETE FROM tasks WHERE id = ?;", taskID)
	if err != nil {
		return fmt.Errorf("failed to remove task %d: %w", taskID, err)
	}
	return nil
}

func (r *TaskRepo) RemoveTaskBySessionAndTarget(ctx context.Context, sessionID string, target string) error {
	tasks, err := r.ListBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	idx := findTaskIndex(tasks, target)
	if idx < 0 || idx >= len(tasks) {
		return fmt.Errorf("task matching '%s' not found in session %s", target, sessionID)
	}
	return r.RemoveTask(ctx, tasks[idx].ID)
}

func (r *TaskRepo) ListBySession(ctx context.Context, sessionID string) ([]domain.TaskRecord, error) {
	query := `
		SELECT id, session_id, content, status, priority, order_index, source, scheduled_at, started_at, completed_at, created_at
		FROM tasks WHERE session_id = ? ORDER BY order_index ASC, id ASC;
	`
	rows, err := r.db.db.QueryContext(ctx, query, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks for session %s: %w", sessionID, err)
	}
	defer rows.Close()

	var result []domain.TaskRecord
	for rows.Next() {
		var t domain.TaskRecord
		var sID sql.NullString
		var sched, start, comp sql.NullTime

		if err := rows.Scan(
			&t.ID,
			&sID,
			&t.Content,
			&t.Status,
			&t.Priority,
			&t.OrderIndex,
			&t.Source,
			&sched,
			&start,
			&comp,
			&t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}

		if sID.Valid {
			t.SessionID = &sID.String
		}
		if sched.Valid {
			t.ScheduledAt = &sched.Time
		}
		if start.Valid {
			t.StartedAt = &start.Time
		}
		if comp.Valid {
			t.CompletedAt = &comp.Time
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (r *TaskRepo) ListScheduledPending(ctx context.Context, before time.Time, limit int) ([]domain.TaskRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `
		SELECT id, session_id, content, status, priority, order_index, source, scheduled_at, started_at, completed_at, created_at
		FROM tasks WHERE status = 'pending' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
		ORDER BY scheduled_at ASC LIMIT ?;
	`
	rows, err := r.db.db.QueryContext(ctx, query, before, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query scheduled tasks: %w", err)
	}
	defer rows.Close()

	var result []domain.TaskRecord
	for rows.Next() {
		var t domain.TaskRecord
		var sID sql.NullString
		var sched, start, comp sql.NullTime

		if err := rows.Scan(
			&t.ID,
			&sID,
			&t.Content,
			&t.Status,
			&t.Priority,
			&t.OrderIndex,
			&t.Source,
			&sched,
			&start,
			&comp,
			&t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}
		if sID.Valid {
			t.SessionID = &sID.String
		}
		if sched.Valid {
			t.ScheduledAt = &sched.Time
		}
		if start.Valid {
			t.StartedAt = &start.Time
		}
		if comp.Valid {
			t.CompletedAt = &comp.Time
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func findTaskIndex(tasks []domain.TaskRecord, target string) int {
	clean := strings.TrimSpace(target)
	if clean == "" {
		return -1
	}
	// Try 1-based index (e.g. "1", "2")
	if n, err := strconv.Atoi(clean); err == nil && n >= 1 && n <= len(tasks) {
		return n - 1
	}
	// Case-insensitive substring match
	lower := strings.ToLower(clean)
	for i, t := range tasks {
		if strings.Contains(strings.ToLower(t.Content), lower) {
			return i
		}
	}
	return -1
}
