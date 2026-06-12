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