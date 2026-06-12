package model

import (
	"time"

	"github.com/google/uuid"
)

type Attachment struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"task_id"`
	UserID    uuid.UUID `json:"user_id"`
	Filename  string    `json:"filename"`
	URL       string    `json:"url"`
	SizeBytes *int32    `json:"size_bytes"`
	MimeType  *string   `json:"mime_type"`
	CreatedAt time.Time `json:"created_at"`
}