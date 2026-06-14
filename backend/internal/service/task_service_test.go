package service_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
	"github.com/prateekmahapatra/task_rival/backend/internal/sse"
)

// createTestUser is a shared helper for the task service tests.
func createTestUser(t *testing.T, pool *pgxpool.Pool) *model.User {
	t.Helper()

	users := repository.NewUserRepo(pool)
	user, err := users.Create(context.Background(), &model.User{
		Email:    fmt.Sprintf("task-user-%d@example.com", time.Now().UnixNano()),
		Password: "hashed",
		Name:     "Task User",
		Role:     model.RoleUser,
	})
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	return user
}

func TestTaskService_CreateTask(t *testing.T) {
	pool := newTestPool(t)
	user := createTestUser(t, pool)

	tasks := repository.NewTaskRepo(pool)
	activity := repository.NewActivityRepo(pool)
	svc := service.NewTaskService(tasks, activity, sse.NewBroker())

	desc := "task description"
	task, err := svc.CreateTask(context.Background(), service.CreateTaskInput{
		UserID:      user.ID,
		Title:       "Write tests",
		Description: &desc,
		Status:      model.StatusTodo,
		Priority:    model.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateTask() error = %v", err)
	}

	if task.Title != "Write tests" {
		t.Errorf("Title = %q, want %q", task.Title, "Write tests")
	}
	if task.UserID != user.ID {
		t.Errorf("UserID = %v, want %v", task.UserID, user.ID)
	}
	if task.Status != model.StatusTodo {
		t.Errorf("Status = %q, want %q", task.Status, model.StatusTodo)
	}
	if task.ID == uuid.Nil {
		t.Error("ID is empty")
	}
}

func TestTaskService_UpdateTask(t *testing.T) {
	pool := newTestPool(t)
	user := createTestUser(t, pool)

	tasks := repository.NewTaskRepo(pool)
	activity := repository.NewActivityRepo(pool)
	svc := service.NewTaskService(tasks, activity, sse.NewBroker())

	created, err := svc.CreateTask(context.Background(), service.CreateTaskInput{
		UserID:   user.ID,
		Title:    "Original title",
		Status:   model.StatusTodo,
		Priority: model.PriorityLow,
	})
	if err != nil {
		t.Fatalf("CreateTask() error = %v", err)
	}

	newTitle := "Updated title"
	newStatus := model.StatusInProgress
	updated, err := svc.UpdateTask(context.Background(), created.ID, user.ID, service.UpdateTaskInput{
		Title:  &newTitle,
		Status: &newStatus,
	})
	if err != nil {
		t.Fatalf("UpdateTask() error = %v", err)
	}

	if updated.Title != newTitle {
		t.Errorf("Title = %q, want %q", updated.Title, newTitle)
	}
	if updated.Status != newStatus {
		t.Errorf("Status = %q, want %q", updated.Status, newStatus)
	}
	if updated.Priority != model.PriorityLow {
		t.Errorf("Priority = %q, want %q (unchanged)", updated.Priority, model.PriorityLow)
	}

	// wrong user -> not found
	_, err = svc.UpdateTask(context.Background(), created.ID, uuid.New(), service.UpdateTaskInput{
		Title: &newTitle,
	})
	if err != service.ErrTaskNotFound {
		t.Errorf("UpdateTask() for wrong user error = %v, want %v", err, service.ErrTaskNotFound)
	}
}
