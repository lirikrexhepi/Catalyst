package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// DB wraps a SQLite database connection with connection pooling and WAL mode.
type DB struct {
	db   *sql.DB
	path string
	mu   sync.RWMutex
}

// Open initializes or connects to a SQLite database at the specified filesystem path.
// It applies production pragmas (WAL mode, foreign keys, busy timeout) and runs schema migrations.
func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)", path)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// SQLite connection pooling: 1 max connection avoids locking contentions
	// while WAL mode allows blazing-fast concurrent operations.
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("failed to ping sqlite database: %w", err)
	}

	wrapper := &DB{
		db:   sqlDB,
		path: path,
	}

	if err := wrapper.migrate(ctx); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("failed to run database migrations: %w", err)
	}

	return wrapper, nil
}

// Raw returns the underlying *sql.DB.
func (d *DB) Raw() *sql.DB {
	return d.db
}

// Close closes the database connection.
func (d *DB) Close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.db == nil {
		return nil
	}
	return d.db.Close()
}
