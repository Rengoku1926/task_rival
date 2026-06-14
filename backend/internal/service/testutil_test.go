package service_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/database"
)

// newTestPool connects to TEST_DATABASE_URL and runs migrations.
// Skips the test if TEST_DATABASE_URL isn't set.
func newTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	if err := database.RunMigrations(url); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	pool, err := database.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect to test database: %v", err)
	}
	t.Cleanup(pool.Close)

	return pool
}
