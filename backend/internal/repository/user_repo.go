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
