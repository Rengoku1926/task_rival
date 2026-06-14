package service_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/prateekmahapatra/task_rival/backend/internal/config"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
)

func TestAuthService_Signup(t *testing.T) {
	pool := newTestPool(t)

	users := repository.NewUserRepo(pool)
	tokens := repository.NewTokenRepo(pool)
	cfg := &config.Config{
		JWTSecret:       "test-secret",
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 24 * time.Hour,
	}
	auth := service.NewAuthService(users, tokens, cfg)

	email := fmt.Sprintf("signup-%d@example.com", time.Now().UnixNano())
	result, err := auth.Signup(context.Background(), service.SignupInput{
		Email:    email,
		Password: "password123",
		Name:     "Test User",
	})
	if err != nil {
		t.Fatalf("Signup() error = %v", err)
	}

	if result.User.Email != email {
		t.Errorf("User.Email = %q, want %q", result.User.Email, email)
	}
	if result.AccessToken == "" {
		t.Error("AccessToken is empty")
	}
	if result.RefreshToken == "" {
		t.Error("RefreshToken is empty")
	}

	// duplicate email should fail
	_, err = auth.Signup(context.Background(), service.SignupInput{
		Email:    email,
		Password: "password123",
		Name:     "Test User",
	})
	if err != service.ErrEmailTaken {
		t.Errorf("second Signup() error = %v, want %v", err, service.ErrEmailTaken)
	}
}
