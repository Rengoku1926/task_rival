package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/prateekmahapatra/task_rival/backend/internal/sse"
)

var ErrTaskNotFound = errors.New("task not found")

type TaskService struct {
	tasks      *repository.TaskRepo
	activity   *repository.ActivityRepo
	broker     *sse.Broker
}

func NewTaskService(
	tasks *repository.TaskRepo,
	activity *repository.ActivityRepo,
	broker *sse.Broker,
) *TaskService {
	return &TaskService{tasks: tasks, activity: activity, broker: broker}
}

// CreateTaskInput is the validated input from the handler.
type CreateTaskInput struct {
	UserID      uuid.UUID
	Title       string
	Description *string
	Status      string
	Priority    string
	DueDate     *string
}

func (s *TaskService) CreateTask(ctx context.Context, in CreateTaskInput) (*model.Task, error) {
	task, err := s.tasks.Create(ctx, &model.Task{
		UserID:      in.UserID,
		Title:       in.Title,
		Description: in.Description,
		Status:      in.Status,
		Priority:    in.Priority,
	})
	if err != nil {
		return nil, fmt.Errorf("create task: %w", err)
	}

	s.logActivity(ctx, task.ID, in.UserID, model.ActionCreated, nil, task)
	s.broker.Publish(in.UserID, sse.Event{Type: "task_created", Payload: task})
	return task, nil
}

func (s *TaskService) GetTask(ctx context.Context, id, userID uuid.UUID) (*model.Task, error) {
	task, err := s.tasks.GetByID(ctx, id, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTaskNotFound
		}
		return nil, fmt.Errorf("get task: %w", err)
	}
	return task, nil
}

// GetTaskAdmin fetches a task by id regardless of owner (admin use only).
func (s *TaskService) GetTaskAdmin(ctx context.Context, id uuid.UUID) (*model.Task, error) {
	task, err := s.tasks.GetByIDAdmin(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTaskNotFound
		}
		return nil, fmt.Errorf("get task: %w", err)
	}
	return task, nil
}

func (s *TaskService) ListTasks(ctx context.Context, p repository.ListTasksParams) (repository.ListTasksResult, error) {
	result, err := s.tasks.List(ctx, p)
	if err != nil {
		return repository.ListTasksResult{}, fmt.Errorf("list tasks: %w", err)
	}
	return result, nil
}

// UpdateTaskInput holds the partial update fields — nil means "do not change".
type UpdateTaskInput struct {
	Title       *string
	Description *string
	Status      *string
	Priority    *string
	DueDate     *string
}

func (s *TaskService) UpdateTask(ctx context.Context, id, userID uuid.UUID, in UpdateTaskInput) (*model.Task, error) {
	existing, err := s.tasks.GetByID(ctx, id, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTaskNotFound
		}
		return nil, fmt.Errorf("get task for update: %w", err)
	}

	updated, err := s.tasks.Update(ctx, id, userID, repository.UpdateTaskParams{
		Title:       in.Title,
		Description: in.Description,
		Status:      in.Status,
		Priority:    in.Priority,
		DueDate:     in.DueDate,
	})
	if err != nil {
		return nil, fmt.Errorf("update task: %w", err)
	}

	s.logActivity(ctx, id, userID, model.ActionUpdated, existing, updated)
	s.broker.Publish(userID, sse.Event{Type: "task_updated", Payload: updated})
	return updated, nil
}

func (s *TaskService) DeleteTask(ctx context.Context, id, userID uuid.UUID) error {
	existing, err := s.tasks.GetByID(ctx, id, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrTaskNotFound
		}
		return fmt.Errorf("get task for delete: %w", err)
	}

	if err := s.tasks.Delete(ctx, id, userID); err != nil {
		return fmt.Errorf("delete task: %w", err)
	}

	s.logActivity(ctx, id, userID, model.ActionDeleted, existing, nil)
	s.broker.Publish(userID, sse.Event{Type: "task_deleted", Payload: map[string]string{"id": id.String()}})
	return nil
}

func (s *TaskService) AdminListTasks(ctx context.Context, p repository.ListTasksParams) (repository.ListTasksResult, error) {
	p.UserID = uuid.Nil // signal to repo: no user filter
	return s.tasks.List(ctx, p)
}

// logActivity records a diff entry. Errors are logged but don't fail the
// caller — activity logging should never block the main operation.
func (s *TaskService) logActivity(ctx context.Context, taskID, userID uuid.UUID, action string, before, after any) {
	diff, err := json.Marshal(map[string]any{"before": before, "after": after})
	if err != nil {
		return
	}
	_ = s.activity.Create(ctx, &model.ActivityLog{
		TaskID: taskID,
		UserID: userID,
		Action: action,
		Diff:   diff,
	})
}