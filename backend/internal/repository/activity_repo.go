package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
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