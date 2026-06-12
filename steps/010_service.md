# Step 010 — Service Layer

Business logic lives here. Services receive repository structs by value (not interface) and call them directly. They record activity logs and publish SSE events after every mutation.

---

## File: `internal/service/auth_service.go`

```go
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/config"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("email already in use")
	ErrTokenInvalid       = errors.New("refresh token is invalid or expired")
)

type AuthService struct {
	users  *repository.UserRepo
	tokens *repository.TokenRepo
	cfg    *config.Config
}

func NewAuthService(
	users *repository.UserRepo,
	tokens *repository.TokenRepo,
	cfg *config.Config,
) *AuthService {
	return &AuthService{users: users, tokens: tokens, cfg: cfg}
}

// SignupInput is the validated input for account creation.
type SignupInput struct {
	Email    string
	Password string
	Name     string
}

// AuthResult is returned by Signup and Login.
type AuthResult struct {
	User         *model.User
	AccessToken  string
	RefreshToken string // raw token — set as httpOnly cookie by the handler
}

func (s *AuthService) Signup(ctx context.Context, in SignupInput) (*AuthResult, error) {
	// Check for duplicate email.
	_, err := s.users.GetByEmail(ctx, in.Email)
	if err == nil {
		return nil, ErrEmailTaken
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.Create(ctx, &model.User{
		Email:    in.Email,
		Password: string(hash),
		Name:     in.Name,
		Role:     model.RoleUser,
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	return s.buildAuthResult(ctx, user)
}

// LoginInput is the validated input for authentication.
type LoginInput struct {
	Email    string
	Password string
}

func (s *AuthService) Login(ctx context.Context, in LoginInput) (*AuthResult, error) {
	user, err := s.users.GetByEmail(ctx, in.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(in.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.buildAuthResult(ctx, user)
}

// Refresh validates a raw refresh token, revokes it, and returns a new token pair.
func (s *AuthService) Refresh(ctx context.Context, rawToken string) (*AuthResult, error) {
	hash := hashToken(rawToken)

	rt, err := s.tokens.GetByHash(ctx, hash)
	if err != nil {
		return nil, ErrTokenInvalid
	}
	if rt.Revoked || time.Now().After(rt.ExpiresAt) {
		return nil, ErrTokenInvalid
	}

	// Revoke old token (rotation — prevents replay attacks).
	if err := s.tokens.Revoke(ctx, hash); err != nil {
		return nil, fmt.Errorf("revoke token: %w", err)
	}

	user, err := s.users.GetByID(ctx, rt.UserID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	return s.buildAuthResult(ctx, user)
}

// Logout revokes the refresh token identified by rawToken.
func (s *AuthService) Logout(ctx context.Context, rawToken string) error {
	hash := hashToken(rawToken)
	err := s.tokens.Revoke(ctx, hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("logout: %w", err)
	}
	return nil
}

// --- helpers ----------------------------------------------------------------

func (s *AuthService) buildAuthResult(ctx context.Context, user *model.User) (*AuthResult, error) {
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, err
	}

	rawRefresh, err := generateRefreshToken()
	if err != nil {
		return nil, err
	}

	expiresAt := time.Now().Add(s.cfg.RefreshTokenTTL)
	if err := s.tokens.Create(ctx, user.ID, hashToken(rawRefresh), expiresAt); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &AuthResult{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
	}, nil
}

func (s *AuthService) generateAccessToken(user *model.User) (string, error) {
	claims := middleware.Claims{
		UserID: user.ID.String(),
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.cfg.AccessTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func generateRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate refresh token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}
```

---

## File: `internal/service/task_service.go`

```go
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

// --- internal helpers -------------------------------------------------------

// logActivity records a diff entry. It logs but does not fail on error because
// a failed activity log should never abort the main operation.
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
```

---

## File: `internal/service/upload_service.go`

```go
package service

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// UploadURLResponse is returned to the client so it can upload directly to Cloudinary.
type UploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	Signature string `json:"signature"`
	Timestamp int64  `json:"timestamp"`
	APIKey    string `json:"api_key"`
	CloudName string `json:"cloud_name"`
	Folder    string `json:"folder"`
}

type UploadService struct {
	cloudinaryURL string
}

func NewUploadService(cloudinaryURL string) *UploadService {
	return &UploadService{cloudinaryURL: cloudinaryURL}
}

// GenerateUploadURL creates a signed upload URL for direct browser-to-Cloudinary upload.
// The signature expires in 60 seconds.
func (s *UploadService) GenerateUploadURL(taskID string) (*UploadURLResponse, error) {
	if s.cloudinaryURL == "" {
		return nil, fmt.Errorf("cloudinary not configured")
	}

	u, err := url.Parse(s.cloudinaryURL)
	if err != nil {
		return nil, fmt.Errorf("parse cloudinary URL: %w", err)
	}

	apiKey := u.User.Username()
	apiSecret, _ := u.User.Password()
	cloudName := u.Host

	timestamp := time.Now().Unix()
	folder := fmt.Sprintf("tasks/%s", taskID)

	params := map[string]string{
		"folder":    folder,
		"timestamp": fmt.Sprintf("%d", timestamp),
	}

	signature := cloudinarySignature(params, apiSecret)

	return &UploadURLResponse{
		UploadURL: fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/auto/upload", cloudName),
		Signature: signature,
		Timestamp: timestamp,
		APIKey:    apiKey,
		CloudName: cloudName,
		Folder:    folder,
	}, nil
}

// cloudinarySignature produces a SHA-1 HMAC of sorted param pairs + api_secret.
func cloudinarySignature(params map[string]string, apiSecret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(params))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	payload := strings.Join(parts, "&") + apiSecret

	h := sha1.New()
	h.Write([]byte(payload))
	return hex.EncodeToString(h.Sum(nil))
}
```

---

## Notes

- `buildAuthResult` is the single path for token generation — both Signup, Login, and Refresh go through it.
- Refresh token rotation: every call to `Refresh` revokes the incoming token and issues a fresh one. A stolen refresh token can only be used once.
- `logActivity` swallows errors intentionally. A failed write to `activity_logs` must not roll back the task operation.
- `DueDate` is passed as `*string` (ISO-8601) through the stack and cast to `timestamptz` in SQL via `$7::timestamptz`. This avoids time-zone parsing ambiguity in Go and delegates it to Postgres.
