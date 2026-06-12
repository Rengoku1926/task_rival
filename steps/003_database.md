# Step 003 — Database Connection

Set up `pgxpool` and embed migration files into the binary so they run automatically on every deploy.

Two connection strings are used:
- `DatabaseURL` (direct, port 5432) — migrations only; `golang-migrate` needs advisory locks which don't work through PgBouncer
- `DatabasePoolerURL` (PgBouncer, port 6543) — all application queries; `QueryExecModeSimpleProtocol` is required because PgBouncer transaction mode does not support prepared statements

## File: `internal/database/postgres.go`

```go
package database

import (
	"context"
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// New creates a pgxpool connected to the pooler URL (PgBouncer).
// QueryExecModeSimpleProtocol is required for PgBouncer transaction mode.
func New(ctx context.Context, poolerURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(poolerURL)
	if err != nil {
		return nil, fmt.Errorf("parse pool config: %w", err)
	}

	// PgBouncer transaction mode does not support extended query protocol.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	cfg.MaxConns = 10
	cfg.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

// RunMigrations applies all pending up-migrations using the direct (non-pooled) URL.
// It is a no-op when no new migrations exist.
func RunMigrations(directURL string) error {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("create migration source: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, directURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}
```

## Notes

- `//go:embed migrations/*.sql` embeds all SQL files into the binary at compile time — no need to ship migration files separately in production.
- `defer m.Close()` closes both the source and the database connection used by the migrator.
- `migrate.ErrNoChange` is not an error — it means all migrations are already applied.
- In local Docker dev both `DATABASE_URL` and `DATABASE_POOLER_URL` point to the same local Postgres, so `QueryExecModeSimpleProtocol` is harmless.

## Verify

Add a temporary call in `main.go`:

```go
if err := database.RunMigrations(cfg.DatabaseURL); err != nil {
    log.Fatal("migrations:", err)
}

pool, err := database.New(ctx, cfg.DatabasePoolerURL)
if err != nil {
    log.Fatal("database:", err)
}
defer pool.Close()

fmt.Println("database connected")
```
