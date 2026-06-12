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