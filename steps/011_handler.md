# Step 011 — Handlers

Handlers decode requests, validate input, call services, and write JSON responses. A shared `response.go` file defines the response envelope so every endpoint returns the same shape.

---

## File: `internal/handler/response.go`

```go
package handler

import (
	"encoding/json"
	"net/http"
)

// envelope is the standard JSON wrapper for every API response.
type envelope struct {
	Success bool      `json:"success"`
	Data    any       `json:"data,omitempty"`
	Error   *apiError `json:"error,omitempty"`
	Meta    *meta     `json:"meta,omitempty"`
}

type apiError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type meta struct {
	Page    int `json:"page"`
	PerPage int `json:"per_page"`
	Total   int `json:"total"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(envelope{Success: true, Data: data})
}

func writeJSONWithMeta(w http.ResponseWriter, status int, data any, m *meta) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(envelope{Success: true, Data: data, Meta: m})
}

func writeError(w http.ResponseWriter, status int, code, message string, fields map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(envelope{
		Success: false,
		Error:   &apiError{Code: code, Message: message, Fields: fields},
	})
}

// Error code constants used across handlers.
const (
	codeValidation   = "VALIDATION_ERROR"
	codeUnauthorized = "UNAUTHORIZED"
	codeForbidden    = "FORBIDDEN"
	codeNotFound     = "NOT_FOUND"
	codeConflict     = "CONFLICT"
	codeInternal     = "INTERNAL_ERROR"
)
```

---

## File: `internal/handler/health_handler.go`

```go
package handler

import (
	"net/http"
	"time"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler { return &HealthHandler{} }

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"time":   time.Now().UTC(),
	})
}
```

---

## File: `internal/handler/auth_handler.go`

```go
package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
	"github.com/prateekmahapatra/task_rival/backend/internal/validator"
	"github.com/rs/zerolog"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

// POST /auth/signup
func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	errs := validator.Errors{}
	validator.Required(errs, "email", req.Email)
	validator.Email(errs, "email", req.Email)
	validator.Required(errs, "password", req.Password)
	validator.MinLen(errs, "password", req.Password, 8)
	validator.Required(errs, "name", req.Name)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	result, err := h.auth.Signup(r.Context(), service.SignupInput{
		Email:    req.Email,
		Password: req.Password,
		Name:     req.Name,
	})
	if err != nil {
		if errors.Is(err, service.ErrEmailTaken) {
			writeError(w, http.StatusConflict, codeConflict, "email already in use", nil)
			return
		}
		log.Error().Err(err).Msg("signup failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	setRefreshCookie(w, result.RefreshToken, time.Now().Add(7*24*time.Hour))
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":         result.User,
		"access_token": result.AccessToken,
	})
}

// POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	errs := validator.Errors{}
	validator.Required(errs, "email", req.Email)
	validator.Required(errs, "password", req.Password)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	result, err := h.auth.Login(r.Context(), service.LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "invalid email or password", nil)
			return
		}
		log.Error().Err(err).Msg("login failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	setRefreshCookie(w, result.RefreshToken, time.Now().Add(7*24*time.Hour))
	writeJSON(w, http.StatusOK, map[string]any{
		"user":         result.User,
		"access_token": result.AccessToken,
	})
}

// POST /auth/refresh  — reads httpOnly cookie
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "refresh token missing", nil)
		return
	}

	result, err := h.auth.Refresh(r.Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, service.ErrTokenInvalid) {
			clearRefreshCookie(w)
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "refresh token invalid or expired", nil)
			return
		}
		log.Error().Err(err).Msg("refresh failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	setRefreshCookie(w, result.RefreshToken, time.Now().Add(7*24*time.Hour))
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": result.AccessToken,
	})
}

// POST /auth/logout  — requires Auth middleware
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err == nil {
		_ = h.auth.Logout(r.Context(), cookie.Value)
	}
	clearRefreshCookie(w)
	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// --- cookie helpers ---------------------------------------------------------

func setRefreshCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    token,
		Expires:  expires,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     "/auth",
	})
}

func clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		Path:     "/auth",
	})
}

// currentUserID is a convenience used across handlers.
func currentUserID(r *http.Request) interface{ String() string } {
	return middleware.UserIDFrom(r.Context())
}
```

---

## File: `internal/handler/task_handler.go`

```go
package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
	"github.com/prateekmahapatra/task_rival/backend/internal/validator"
	"github.com/rs/zerolog"
)

type TaskHandler struct {
	tasks *service.TaskService
}

func NewTaskHandler(tasks *service.TaskService) *TaskHandler {
	return &TaskHandler{tasks: tasks}
}

// GET /tasks
func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFrom(r.Context())
	q := r.URL.Query()

	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("per_page"))

	params := repository.ListTasksParams{
		UserID:  userID,
		Status:  q.Get("status"),
		Q:       q.Get("q"),
		Sort:    q.Get("sort"),
		Order:   q.Get("order"),
		Page:    page,
		PerPage: perPage,
	}

	result, err := h.tasks.ListTasks(r.Context(), params)
	if err != nil {
		zerolog.Ctx(r.Context()).Error().Err(err).Msg("list tasks")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	writeJSONWithMeta(w, http.StatusOK, result.Tasks, &meta{
		Page:    page,
		PerPage: perPage,
		Total:   result.Total,
	})
}

// POST /tasks
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())

	var req struct {
		Title       string  `json:"title"`
		Description *string `json:"description"`
		Status      string  `json:"status"`
		Priority    string  `json:"priority"`
		DueDate     *string `json:"due_date"` // ISO-8601 or null
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	if req.Status == "" {
		req.Status = model.StatusTodo
	}
	if req.Priority == "" {
		req.Priority = model.PriorityMedium
	}

	errs := validator.Errors{}
	validator.Required(errs, "title", req.Title)
	validator.MaxLen(errs, "title", req.Title, 255)
	validator.OneOf(errs, "status", req.Status, model.StatusTodo, model.StatusInProgress, model.StatusDone)
	validator.OneOf(errs, "priority", req.Priority, model.PriorityLow, model.PriorityMedium, model.PriorityHigh)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	task, err := h.tasks.CreateTask(r.Context(), service.CreateTaskInput{
		UserID:      userID,
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		DueDate:     req.DueDate,
	})
	if err != nil {
		log.Error().Err(err).Msg("create task")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	writeJSON(w, http.StatusCreated, task)
}

// GET /tasks/{id}
func (h *TaskHandler) Get(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	task, err := h.tasks.GetTask(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, service.ErrTaskNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "task not found", nil)
			return
		}
		log.Error().Err(err).Msg("get task")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	writeJSON(w, http.StatusOK, task)
}

// PATCH /tasks/{id}
func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
		Priority    *string `json:"priority"`
		DueDate     *string `json:"due_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	errs := validator.Errors{}
	if req.Title != nil {
		validator.Required(errs, "title", *req.Title)
		validator.MaxLen(errs, "title", *req.Title, 255)
	}
	validator.OneOfPtr(errs, "status", req.Status, model.StatusTodo, model.StatusInProgress, model.StatusDone)
	validator.OneOfPtr(errs, "priority", req.Priority, model.PriorityLow, model.PriorityMedium, model.PriorityHigh)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	task, err := h.tasks.UpdateTask(r.Context(), id, userID, service.UpdateTaskInput{
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		Priority:    req.Priority,
		DueDate:     req.DueDate,
	})
	if err != nil {
		if errors.Is(err, service.ErrTaskNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "task not found", nil)
			return
		}
		log.Error().Err(err).Msg("update task")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	writeJSON(w, http.StatusOK, task)
}

// DELETE /tasks/{id}
func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	if err := h.tasks.DeleteTask(r.Context(), id, userID); err != nil {
		if errors.Is(err, service.ErrTaskNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "task not found", nil)
			return
		}
		log.Error().Err(err).Msg("delete task")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /admin/tasks
func (h *TaskHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("per_page"))

	result, err := h.tasks.AdminListTasks(r.Context(), repository.ListTasksParams{
		Status:  q.Get("status"),
		Q:       q.Get("q"),
		Sort:    q.Get("sort"),
		Order:   q.Get("order"),
		Page:    page,
		PerPage: perPage,
	})
	if err != nil {
		zerolog.Ctx(r.Context()).Error().Err(err).Msg("admin list tasks")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}

	writeJSONWithMeta(w, http.StatusOK, result.Tasks, &meta{
		Page:    page,
		PerPage: perPage,
		Total:   result.Total,
	})
}
```

---

## File: `internal/handler/attachment_handler.go`

```go
package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
	"github.com/prateekmahapatra/task_rival/backend/internal/validator"
	"github.com/rs/zerolog"
)

type AttachmentHandler struct {
	attachments *repository.AttachmentRepo
	tasks       *repository.TaskRepo
	upload      *service.UploadService
	activity    *repository.ActivityRepo
}

func NewAttachmentHandler(
	attachments *repository.AttachmentRepo,
	tasks *repository.TaskRepo,
	upload *service.UploadService,
	activity *repository.ActivityRepo,
) *AttachmentHandler {
	return &AttachmentHandler{
		attachments: attachments,
		tasks:       tasks,
		upload:      upload,
		activity:    activity,
	}
}

// GET /tasks/{id}/attachments/upload-url
func (h *AttachmentHandler) UploadURL(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFrom(r.Context())
	taskID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	// Ensure the task belongs to the user.
	if _, err := h.tasks.GetByID(r.Context(), taskID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, codeNotFound, "task not found", nil)
			return
		}
		zerolog.Ctx(r.Context()).Error().Err(err).Msg("get task for upload url")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	resp, err := h.upload.GenerateUploadURL(taskID.String())
	if err != nil {
		zerolog.Ctx(r.Context()).Error().Err(err).Msg("generate upload url")
		writeError(w, http.StatusInternalServerError, codeInternal, "could not generate upload URL", nil)
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// POST /tasks/{id}/attachments
func (h *AttachmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())
	taskID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	var req struct {
		Filename  string  `json:"filename"`
		URL       string  `json:"url"`
		SizeBytes *int32  `json:"size_bytes"`
		MimeType  *string `json:"mime_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	errs := validator.Errors{}
	validator.Required(errs, "filename", req.Filename)
	validator.Required(errs, "url", req.URL)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	// Only accept URLs from Cloudinary to prevent arbitrary URL injection.
	if !strings.Contains(req.URL, "cloudinary.com") {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "url must be a cloudinary URL", nil)
		return
	}

	attachment, err := h.attachments.Create(r.Context(), &model.Attachment{
		TaskID:    taskID,
		UserID:    userID,
		Filename:  req.Filename,
		URL:       req.URL,
		SizeBytes: req.SizeBytes,
		MimeType:  req.MimeType,
	})
	if err != nil {
		log.Error().Err(err).Msg("create attachment")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	_ = h.activity.Create(r.Context(), &model.ActivityLog{
		TaskID: taskID,
		UserID: userID,
		Action: model.ActionAttachmentAdded,
	})

	writeJSON(w, http.StatusCreated, attachment)
}

// GET /tasks/{id}/attachments
func (h *AttachmentHandler) List(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())
	taskID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	// Ownership check
	if _, err := h.tasks.GetByID(r.Context(), taskID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, codeNotFound, "task not found", nil)
			return
		}
		log.Error().Err(err).Msg("get task for attachment list")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	list, err := h.attachments.ListByTaskID(r.Context(), taskID)
	if err != nil {
		log.Error().Err(err).Msg("list attachments")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	writeJSON(w, http.StatusOK, list)
}
```

---

## File: `internal/handler/activity_handler.go`

```go
package handler

import (
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/rs/zerolog"
)

type ActivityHandler struct {
	activity *repository.ActivityRepo
}

func NewActivityHandler(activity *repository.ActivityRepo) *ActivityHandler {
	return &ActivityHandler{activity: activity}
}

// GET /tasks/{id}/activity
func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())
	userID := middleware.UserIDFrom(r.Context())

	taskID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid task id", nil)
		return
	}

	logs, err := h.activity.ListByTaskID(r.Context(), taskID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusOK, []*struct{}{})
			return
		}
		log.Error().Err(err).Msg("list activity")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	writeJSON(w, http.StatusOK, logs)
}
```

---

## File: `internal/handler/sse_handler.go`

```go
package handler

import (
	"fmt"
	"net/http"

	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/sse"
	"github.com/rs/zerolog"
)

type SSEHandler struct {
	broker *sse.Broker
	cfg    interface{ JWTSecret() string } // avoid importing config directly
}

// SSEHandlerDeps holds what the SSE handler needs.
type SSEHandlerDeps struct {
	Broker    *sse.Broker
	JWTSecret string
}

type SSEHandler2 struct {
	broker    *sse.Broker
	jwtSecret string
}

func NewSSEHandler(broker *sse.Broker, jwtSecret string) *SSEHandler2 {
	return &SSEHandler2{broker: broker, jwtSecret: jwtSecret}
}

// GET /events?token=<access_token>
//
// EventSource (browser API) cannot set custom headers, so the JWT is passed
// as a query parameter. We verify it here instead of in the Auth middleware.
func (h *SSEHandler2) Stream(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	// Verify token from query parameter.
	token := r.URL.Query().Get("token")
	if token == "" {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "token required", nil)
		return
	}

	// Reuse the same parseToken helper from the middleware package.
	// We inline a minimal config struct to avoid circular imports.
	type minCfg struct{ JWTSecret string }

	claims, err := parseTokenStr(token, h.jwtSecret)
	if err != nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "invalid token", nil)
		return
	}

	userID := middleware.UserIDFrom(
		withUserContext(r.Context(), claims.UserID, claims.Role),
	)

	// Verify the client supports flushing.
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, codeInternal, "streaming not supported", nil)
		return
	}

	// Set SSE headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable Nginx buffering
	w.WriteHeader(http.StatusOK)

	// Subscribe to the broker.
	events, unsub := h.broker.Subscribe(userID)
	defer unsub()

	log.Info().Str("user_id", userID.String()).Msg("sse client connected")

	// Send a connected confirmation.
	fmt.Fprintf(w, "data: {\"type\":\"connected\"}\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			log.Info().Str("user_id", userID.String()).Msg("sse client disconnected")
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			data, err := sse.Marshal(event)
			if err != nil {
				continue
			}
			if _, err := w.Write(data); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
```

---

## File: `internal/handler/sse_helper.go`

```go
package handler

import (
	"context"

	"github.com/golang-jwt/jwt/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
)

// parseTokenStr re-uses middleware.Claims but lives in the handler package to
// avoid importing middleware from within itself.
func parseTokenStr(tokenStr, secret string) (*middleware.Claims, error) {
	claims := &middleware.Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

type contextKey2 string

const (
	ctxUserID contextKey2 = "userID2"
	ctxRole   contextKey2 = "role2"
)

// withUserContext injects user ID and role into a context so middleware.UserIDFrom can read them.
func withUserContext(ctx context.Context, userID, role string) context.Context {
	ctx = context.WithValue(ctx, middleware.ContextKeyUserID(), userID)
	ctx = context.WithValue(ctx, middleware.ContextKeyRole(), role)
	return ctx
}
```

> **Note:** `middleware.ContextKeyUserID()` and `middleware.ContextKeyRole()` need to be exported from the middleware package. Update `internal/middleware/auth.go` to export the key getter functions:

```go
// Add these two functions to middleware/auth.go

// ContextKeyUserID returns the context key for the user ID value.
// Exported so the SSE handler can inject the value without the Auth middleware.
func ContextKeyUserID() any { return contextKey("userID") }

// ContextKeyRole returns the context key for the role value.
func ContextKeyRole() any { return contextKey("role") }
```
