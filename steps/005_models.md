# Step 005 — Models

Plain Go structs that mirror the database tables. No methods, no business logic — just data shapes. Pointer fields represent nullable columns.

---

## File: `internal/model/user.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)

type User struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // never serialised to JSON
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
```

---

## File: `internal/model/task.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	StatusTodo       = "todo"
	StatusInProgress = "in_progress"
	StatusDone       = "done"

	PriorityLow    = "low"
	PriorityMedium = "medium"
	PriorityHigh   = "high"
)

type Task struct {
	ID          uuid.UUID  `json:"id"`
	UserID      uuid.UUID  `json:"user_id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	DueDate     *time.Time `json:"due_date"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
```

---

## File: `internal/model/attachment.go`

```go
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
```

---

## File: `internal/model/activity.go`

```go
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
```

---

## File: `internal/model/refresh_token.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

type RefreshToken struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	TokenHash string    `json:"-"` // never exposed
	ExpiresAt time.Time `json:"expires_at"`
	Revoked   bool      `json:"revoked"`
	CreatedAt time.Time `json:"created_at"`
}
```

---

## Notes

- `json:"-"` on `Password` and `TokenHash` ensures they are never accidentally included in an API response.
- Pointer types (`*string`, `*time.Time`, `*int32`) map to nullable database columns. `pgx/v5` scans `NULL` into a nil pointer natively.
- Constants for status, priority, role, and action values are co-located with their structs — any file that imports `model` gets the full set of valid values.
- `json.RawMessage` for `Diff` lets the JSONB pass through as-is without double-encoding.
