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