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