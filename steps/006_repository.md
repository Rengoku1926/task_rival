# Step 006 — Repository

One file per domain. Each repo holds a `*pgxpool.Pool` and owns all raw SQL for its table. No business logic here — just database I/O.

---

## File: `internal/repository/user_repo.go`

```go
package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) Create(ctx context.Context, u *model.User) (*model.User, error) {
	query := `
		INSERT INTO users (email, password, name, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, email, password, name, role, created_at, updated_at`

	row := r.pool.QueryRow(ctx, query, u.Email, u.Password, u.Name, u.Role)
	return scanUser(row)
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	query := `
		SELECT id, email, password, name, role, created_at, updated_at
		FROM users WHERE email = $1`

	row := r.pool.QueryRow(ctx, query, email)
	return scanUser(row)
}

func (r *UserRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	query := `
		SELECT id, email, password, name, role, created_at, updated_at
		FROM users WHERE id = $1`

	row := r.pool.QueryRow(ctx, query, id)
	return scanUser(row)
}

func (r *UserRepo) List(ctx context.Context) ([]*model.User, error) {
	query := `
		SELECT id, email, password, name, role, created_at, updated_at
		FROM users ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// scanUser works on both pgx.Row and pgx.Rows because both implement RowScanner.
func scanUser(row pgx.Row) (*model.User, error) {
	var u model.User
	err := row.Scan(
		&u.ID, &u.Email, &u.Password, &u.Name, &u.Role,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return &u, nil
}
```

---

## File: `internal/repository/task_repo.go`

```go
package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
)

type TaskRepo struct {
	pool *pgxpool.Pool
}

func NewTaskRepo(pool *pgxpool.Pool) *TaskRepo {
	return &TaskRepo{pool: pool}
}

// ListParams holds all filters/sort/pagination for listing tasks.
type ListTasksParams struct {
	UserID  uuid.UUID // zero value = admin list (all users)
	Status  string
	Q       string
	Sort    string // due_date | priority | created_at
	Order   string // asc | desc
	Page    int
	PerPage int
}

type ListTasksResult struct {
	Tasks []*model.Task
	Total int
}

func (r *TaskRepo) Create(ctx context.Context, t *model.Task) (*model.Task, error) {
	query := `
		INSERT INTO tasks (user_id, title, description, status, priority, due_date)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, title, description, status, priority, due_date, created_at, updated_at`

	row := r.pool.QueryRow(ctx, query,
		t.UserID, t.Title, t.Description, t.Status, t.Priority, t.DueDate)
	return scanTask(row)
}

func (r *TaskRepo) GetByID(ctx context.Context, id, userID uuid.UUID) (*model.Task, error) {
	query := `
		SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
		FROM tasks
		WHERE id = $1 AND user_id = $2`

	row := r.pool.QueryRow(ctx, query, id, userID)
	return scanTask(row)
}

// GetByIDAdmin fetches a task without checking user_id (admin use only).
func (r *TaskRepo) GetByIDAdmin(ctx context.Context, id uuid.UUID) (*model.Task, error) {
	query := `
		SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
		FROM tasks WHERE id = $1`

	row := r.pool.QueryRow(ctx, query, id)
	return scanTask(row)
}

func (r *TaskRepo) List(ctx context.Context, p ListTasksParams) (ListTasksResult, error) {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PerPage < 1 || p.PerPage > 100 {
		p.PerPage = 20
	}
	offset := (p.Page - 1) * p.PerPage

	orderCol := safeOrderCol(p.Sort)
	orderDir := safeOrderDir(p.Order)

	var orderClause string
	if p.Sort == "priority" {
		orderClause = fmt.Sprintf(
			"CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END %s",
			orderDir,
		)
	} else if p.Sort == "due_date" {
		orderClause = fmt.Sprintf("%s %s NULLS LAST", orderCol, orderDir)
	} else {
		orderClause = fmt.Sprintf("%s %s", orderCol, orderDir)
	}

	// Build WHERE clause based on whether we're filtering by user
	var (
		countQuery string
		listQuery  string
		args       []any
	)

	if p.UserID != uuid.Nil {
		args = []any{p.UserID, p.Status, p.Q, p.PerPage, offset}
		countQuery = `
			SELECT COUNT(*) FROM tasks
			WHERE user_id = $1
			  AND ($2 = '' OR status = $2)
			  AND ($3 = '' OR to_tsvector('english', title) @@ plainto_tsquery('english', $3))`
		listQuery = fmt.Sprintf(`
			SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
			FROM tasks
			WHERE user_id = $1
			  AND ($2 = '' OR status = $2)
			  AND ($3 = '' OR to_tsvector('english', title) @@ plainto_tsquery('english', $3))
			ORDER BY %s
			LIMIT $4 OFFSET $5`, orderClause)
	} else {
		// admin: no user_id filter
		args = []any{p.Status, p.Q, p.PerPage, offset}
		countQuery = `
			SELECT COUNT(*) FROM tasks
			WHERE ($1 = '' OR status = $1)
			  AND ($2 = '' OR to_tsvector('english', title) @@ plainto_tsquery('english', $2))`
		listQuery = fmt.Sprintf(`
			SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
			FROM tasks
			WHERE ($1 = '' OR status = $1)
			  AND ($2 = '' OR to_tsvector('english', title) @@ plainto_tsquery('english', $2))
			ORDER BY %s
			LIMIT $3 OFFSET $4`, orderClause)
	}

	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args[:len(args)-2]...).Scan(&total); err != nil {
		return ListTasksResult{}, fmt.Errorf("count tasks: %w", err)
	}

	rows, err := r.pool.Query(ctx, listQuery, args...)
	if err != nil {
		return ListTasksResult{}, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []*model.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return ListTasksResult{}, err
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return ListTasksResult{}, fmt.Errorf("iterate tasks: %w", err)
	}

	return ListTasksResult{Tasks: tasks, Total: total}, nil
}

// UpdateParams holds only the fields that can change. nil = leave unchanged.
type UpdateTaskParams struct {
	Title       *string
	Description *string
	Status      *string
	Priority    *string
	DueDate     *string // ISO8601 string; nil = unchanged, empty string = clear
}

func (r *TaskRepo) Update(ctx context.Context, id, userID uuid.UUID, p UpdateTaskParams) (*model.Task, error) {
	query := `
		UPDATE tasks SET
			title       = COALESCE($3, title),
			description = COALESCE($4, description),
			status      = COALESCE($5, status),
			priority    = COALESCE($6, priority),
			due_date    = COALESCE($7::timestamptz, due_date),
			updated_at  = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, title, description, status, priority, due_date, created_at, updated_at`

	row := r.pool.QueryRow(ctx, query,
		id, userID,
		p.Title, p.Description, p.Status, p.Priority, p.DueDate,
	)
	return scanTask(row)
}

func (r *TaskRepo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	query := `DELETE FROM tasks WHERE id = $1 AND user_id = $2`
	tag, err := r.pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("delete task: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func scanTask(row pgx.Row) (*model.Task, error) {
	var t model.Task
	err := row.Scan(
		&t.ID, &t.UserID, &t.Title, &t.Description,
		&t.Status, &t.Priority, &t.DueDate,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan task: %w", err)
	}
	return &t, nil
}

func safeOrderCol(s string) string {
	switch s {
	case "due_date", "priority", "created_at":
		return s
	default:
		return "created_at"
	}
}

func safeOrderDir(s string) string {
	if s == "asc" {
		return "ASC"
	}
	return "DESC"
}
```

---

## File: `internal/repository/token_repo.go`

```go
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
)

type TokenRepo struct {
	pool *pgxpool.Pool
}

func NewTokenRepo(pool *pgxpool.Pool) *TokenRepo {
	return &TokenRepo{pool: pool}
}

func (r *TokenRepo) Create(ctx context.Context, userID uuid.UUID, tokenHash string, expiresAt time.Time) error {
	query := `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)`

	_, err := r.pool.Exec(ctx, query, userID, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

func (r *TokenRepo) GetByHash(ctx context.Context, tokenHash string) (*model.RefreshToken, error) {
	query := `
		SELECT id, user_id, token_hash, expires_at, revoked, created_at
		FROM refresh_tokens
		WHERE token_hash = $1`

	row := r.pool.QueryRow(ctx, query, tokenHash)

	var rt model.RefreshToken
	err := row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.Revoked, &rt.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return &rt, nil
}

func (r *TokenRepo) Revoke(ctx context.Context, tokenHash string) error {
	query := `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`
	tag, err := r.pool.Exec(ctx, query, tokenHash)
	if err != nil {
		return fmt.Errorf("revoke token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *TokenRepo) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`
	_, err := r.pool.Exec(ctx, query, userID)
	return err
}
```

---

## File: `internal/repository/attachment_repo.go`

```go
package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
)

type AttachmentRepo struct {
	pool *pgxpool.Pool
}

func NewAttachmentRepo(pool *pgxpool.Pool) *AttachmentRepo {
	return &AttachmentRepo{pool: pool}
}

func (r *AttachmentRepo) Create(ctx context.Context, a *model.Attachment) (*model.Attachment, error) {
	query := `
		INSERT INTO attachments (task_id, user_id, filename, url, size_bytes, mime_type)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, task_id, user_id, filename, url, size_bytes, mime_type, created_at`

	row := r.pool.QueryRow(ctx, query,
		a.TaskID, a.UserID, a.Filename, a.URL, a.SizeBytes, a.MimeType)
	return scanAttachment(row)
}

func (r *AttachmentRepo) ListByTaskID(ctx context.Context, taskID uuid.UUID) ([]*model.Attachment, error) {
	query := `
		SELECT id, task_id, user_id, filename, url, size_bytes, mime_type, created_at
		FROM attachments
		WHERE task_id = $1
		ORDER BY created_at ASC`

	rows, err := r.pool.Query(ctx, query, taskID)
	if err != nil {
		return nil, fmt.Errorf("list attachments: %w", err)
	}
	defer rows.Close()

	var list []*model.Attachment
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

func (r *AttachmentRepo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	query := `DELETE FROM attachments WHERE id = $1 AND user_id = $2`
	tag, err := r.pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("delete attachment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func scanAttachment(row pgx.Row) (*model.Attachment, error) {
	var a model.Attachment
	err := row.Scan(
		&a.ID, &a.TaskID, &a.UserID, &a.Filename, &a.URL,
		&a.SizeBytes, &a.MimeType, &a.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("scan attachment: %w", err)
	}
	return &a, nil
}
```

---

## File: `internal/repository/activity_repo.go`

```go
package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
)

type ActivityRepo struct {
	pool *pgxpool.Pool
}

func NewActivityRepo(pool *pgxpool.Pool) *ActivityRepo {
	return &ActivityRepo{pool: pool}
}

func (r *ActivityRepo) Create(ctx context.Context, log *model.ActivityLog) error {
	query := `
		INSERT INTO activity_logs (task_id, user_id, action, diff)
		VALUES ($1, $2, $3, $4)`

	_, err := r.pool.Exec(ctx, query, log.TaskID, log.UserID, log.Action, log.Diff)
	if err != nil {
		return fmt.Errorf("create activity log: %w", err)
	}
	return nil
}

func (r *ActivityRepo) ListByTaskID(ctx context.Context, taskID, userID uuid.UUID) ([]*model.ActivityLog, error) {
	// Verify the user owns the task before returning its activity log.
	query := `
		SELECT al.id, al.task_id, al.user_id, al.action, al.diff, al.created_at
		FROM activity_logs al
		JOIN tasks t ON t.id = al.task_id
		WHERE al.task_id = $1 AND t.user_id = $2
		ORDER BY al.created_at DESC`

	rows, err := r.pool.Query(ctx, query, taskID, userID)
	if err != nil {
		return nil, fmt.Errorf("list activity logs: %w", err)
	}
	defer rows.Close()

	var logs []*model.ActivityLog
	for rows.Next() {
		var l model.ActivityLog
		if err := rows.Scan(
			&l.ID, &l.TaskID, &l.UserID, &l.Action, &l.Diff, &l.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan activity log: %w", err)
		}
		logs = append(logs, &l)
	}
	return logs, rows.Err()
}

// ListByTaskIDAdmin returns activity for any task regardless of ownership.
func (r *ActivityRepo) ListByTaskIDAdmin(ctx context.Context, taskID uuid.UUID) ([]*model.ActivityLog, error) {
	query := `
		SELECT id, task_id, user_id, action, diff, created_at
		FROM activity_logs
		WHERE task_id = $1
		ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query, taskID)
	if err != nil {
		return nil, fmt.Errorf("admin list activity logs: %w", err)
	}
	defer rows.Close()

	var logs []*model.ActivityLog
	for rows.Next() {
		var l model.ActivityLog
		if err := rows.Scan(
			&l.ID, &l.TaskID, &l.UserID, &l.Action, &l.Diff, &l.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan activity log: %w", err)
		}
		logs = append(logs, &l)
	}
	return logs, rows.Err()
}

// pgx.ErrNoRows is re-exported so callers don't need to import pgx.
var ErrNoRows = pgx.ErrNoRows
```

---

## Notes

- `safeOrderCol` and `safeOrderDir` are whitelists that prevent SQL injection in dynamic ORDER BY clauses.
- The `count` query uses the same WHERE clause as the list query so pagination totals are always accurate.
- Activity log creation deliberately ignores errors (fire-and-forget in the service layer) — a failed log should not fail the main operation.
- `ErrNoRows` is re-exported from the repository package so higher layers don't need a direct pgx import.
