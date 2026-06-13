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
			SELECT t.id, t.user_id, t.title, t.description, t.status, t.priority, t.due_date, t.created_at, t.updated_at, u.name, u.email
			FROM tasks t
			JOIN users u ON u.id = t.user_id
			WHERE ($1 = '' OR t.status = $1)
			  AND ($2 = '' OR to_tsvector('english', t.title) @@ plainto_tsquery('english', $2))
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
		var t *model.Task
		if p.UserID != uuid.Nil {
			t, err = scanTask(rows)
		} else {
			t, err = scanTaskWithOwner(rows)
		}
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
	DueDate     *string 
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

// scanTaskWithOwner scans a task row that also includes the owner's name and email
// (admin task listing only).
func scanTaskWithOwner(row pgx.Row) (*model.Task, error) {
	var t model.Task
	err := row.Scan(
		&t.ID, &t.UserID, &t.Title, &t.Description,
		&t.Status, &t.Priority, &t.DueDate,
		&t.CreatedAt, &t.UpdatedAt,
		&t.OwnerName, &t.OwnerEmail,
	)
	if err != nil {
		return nil, fmt.Errorf("scan task with owner: %w", err)
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