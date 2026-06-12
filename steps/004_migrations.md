# Step 004 — SQL Migrations

Two migration files. Migration 001 creates every table. Migration 002 adds the activity log (kept separate so it can be rolled back independently).

Every migration has a matching `.down.sql`. Never write an up migration without a down.

---

## File: `internal/database/migrations/000001_init.up.sql`

```sql
-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL UNIQUE,
    password   TEXT        NOT NULL,           -- bcrypt hash
    name       TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Refresh tokens ───────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,    -- SHA-256 hex of the raw token
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ── Tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'todo'
                            CHECK (status IN ('todo', 'in_progress', 'done')),
    priority    TEXT        NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('low', 'medium', 'high')),
    due_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id    ON tasks(user_id);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_due_date   ON tasks(due_date);
CREATE INDEX idx_tasks_priority   ON tasks(priority);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- Full-text search index on title
CREATE INDEX idx_tasks_title_fts ON tasks USING gin(to_tsvector('english', title));

-- ── Attachments ──────────────────────────────────────────────────────────────
CREATE TABLE attachments (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename   TEXT    NOT NULL,
    url        TEXT    NOT NULL,
    size_bytes INTEGER,
    mime_type  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_task_id ON attachments(task_id);

-- ── updated_at auto-update trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## File: `internal/database/migrations/000001_init.down.sql`

```sql
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS users;
```

---

## File: `internal/database/migrations/000002_activity_log.up.sql`

```sql
CREATE TABLE activity_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT        NOT NULL,  -- created | updated | deleted | status_changed | attachment_added
    diff       JSONB,                 -- { "before": {...}, "after": {...} }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_task_id ON activity_logs(task_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
```

---

## File: `internal/database/migrations/000002_activity_log.down.sql`

```sql
DROP TABLE IF EXISTS activity_logs;
```

---

## Notes

- The `set_updated_at` trigger keeps `updated_at` correct even for direct SQL updates (e.g. from psql or a future admin script).
- The GIN index on `to_tsvector('english', title)` powers the `q=` search parameter without a separate FTS column.
- `JSONB` for `diff` lets you query activity history with Postgres JSON operators if needed later.
- `CHECK` constraints on `status`, `priority`, and `role` enforce the enum values at the DB level — a second line of defence after application validation.

## Rollback

```bash
# Roll back migration 002 only
migrate -path ./internal/database/migrations \
        -database "$DATABASE_URL" down 1

# Roll back everything (dev only — destroys all data)
migrate -path ./internal/database/migrations \
        -database "$DATABASE_URL" down
```
