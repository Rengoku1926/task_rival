package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	ActionCreated          = "created"
	ActionUpdated          = "updated"
	ActionDeleted          = "deleted"
	ActionStatusChanged    = "status_changed"
	ActionAttachmentAdded  = "attachment_added"
)

type ActivityLog struct {
	ID        uuid.UUID       `json:"id"`
	TaskID    uuid.UUID       `json:"task_id"`
	UserID    uuid.UUID       `json:"user_id"`
	Action    string          `json:"action"`
	Diff      json.RawMessage `json:"diff,omitempty"` // raw JSONB from Postgres
	CreatedAt time.Time       `json:"created_at"`
}