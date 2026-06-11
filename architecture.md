# Task Management Application — Architecture

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Tech Stack Decisions](#tech-stack-decisions)
4. [File & Folder Structure](#file--folder-structure)
5. [Backend Architecture](#backend-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Database Schema](#database-schema)
8. [Authentication Flow](#authentication-flow)
9. [Real-time Updates (SSE)](#real-time-updates-sse)
10. [Optimistic UI & Rollback](#optimistic-ui--rollback)
11. [File Uploads](#file-uploads)
12. [Activity Log](#activity-log)
13. [Docker Setup](#docker-setup)
14. [Deployment Strategy](#deployment-strategy)
15. [Failure Points & Mitigations](#failure-points--mitigations)
16. [Environment Variables](#environment-variables)
17. [API Reference](#api-reference)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│   Next.js 14 (App Router)  ·  Vercel Edge Network               │
│   TanStack Query · Zustand · Tailwind CSS                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / SSE
┌───────────────────────────▼─────────────────────────────────────┐
│                         API LAYER                               │
│   Go (net/http + ServeMux)  ·  Render.com (auto-scaled)         │
│   JWT Auth · Rate Limiting · Request Validation                 │
└──────────┬──────────────────────────────┬───────────────────────┘
           │                              │
┌──────────▼──────────┐        ┌──────────▼──────────────────────┐
│   PostgreSQL 16      │        │   Cloudinary / S3-compatible   │
│   (Supabase)        │        │   (file attachments)            │
│   PgBouncer pooling  │        └────────────────────────────────┘
│   via pgxpool        │
└─────────────────────┘
```

---

## Architecture Diagram

```
                              ┌────────────┐
                              │   GitHub   │
                              │  Actions   │
                              └─────┬──────┘
                                    │ CI (test + lint)
               ┌────────────────────┼────────────────────┐
               │                    │                     │
         Push to main          Push to main         Push to main
               │                    │                     │
   ┌───────────▼──────────┐  ┌──────▼──────────┐         │
   │      Vercel           │  │    Render.com   │         │
   │  (Next.js Frontend)  │  │  (Go Backend)   │         │
   │  - SSR / ISR          │  │  - Auto-deploy  │         │
   │  - Edge middleware    │  │  - Health check │         │
   │  - Env vars injected  │  │  - Zero-downtime│         │
   └───────────┬───────────┘  └──────┬──────────┘         │
               │ fetch/SSE           │ pgxpool             │
               │              ┌──────▼──────────┐         │
               │              │  PostgreSQL 16   │         │
               │              │  (Supabase)      │         │
               │              │  - PgBouncer     │         │
               │              │  - Daily backups │         │
               │              │  - PITR (7 days) │         │
               │              └─────────────────┘         │
               │                                          │
                           HTTPS (CORS configured)
```

---

## Tech Stack Decisions

| Layer              | Choice                                                                        | Reason                                                                                         |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Frontend Framework | Next.js 14 (App Router)                                                       | SSR for SEO, RSC for perf, Vercel-native                                                       |
| Styling            | Tailwind CSS + shadcn/ui                                                      | Production-grade components, accessible                                                        |
| State Management   | Zustand (client) + TanStack Query (server)                                    | Separation of concerns; optimistic updates built-in to TQ                                      |
| Backend Language   | Go (stdlib `net/http` + `ServeMux`)                                           | Zero external dependencies for routing; Go 1.22 ServeMux supports `METHOD /path/{id}` natively |
| DB Driver          | pgx/v5                                                                        | Direct PostgreSQL driver; raw SQL written in repository layer, no code generation              |
| Migrations         | golang-migrate                                                                | Battle-tested, CLI and programmatic API                                                        |
| Auth               | JWT (HS256, `golang-jwt/jwt`) + refresh tokens                                | Only non-stdlib dep needed; stateless, Render-compatible                                       |
| Real-time          | Server-Sent Events (SSE)                                                      | Simpler than WebSockets for unidirectional push; works through Render's HTTP                   |
| File Uploads       | Cloudinary (free tier)                                                        | No S3 infra needed; direct upload from browser via signed URL                                  |
| Testing            | Go: stdlib `testing` + `net/http/httptest`; Next.js: Vitest + Testing Library | Zero extra deps on backend; idiomatic                                                          |
| CI                 | GitHub Actions                                                                | Free, integrates with both Vercel and Render                                                   |

### Backend External Dependencies (go.mod)

The backend uses **only stdlib** for HTTP routing, middleware, and JSON. The minimal set of external packages:

| Package                                | Purpose                             | Why not stdlib                                                    |
| -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `github.com/jackc/pgx/v5`              | PostgreSQL driver + connection pool | No stdlib Postgres driver                                         |
| `github.com/golang-migrate/migrate/v4` | DB migrations                       | Avoids reinventing migration state tracking                       |
| `github.com/golang-jwt/jwt/v5`         | JWT sign/verify                     | Correct HMAC constant-time comparison, hard to get right manually |
| `github.com/google/uuid`               | UUID generation                     | `gen_random_uuid()` is DB-side; needed for client-side pre-ID     |
| `golang.org/x/crypto`                  | `bcrypt`                            | Part of the extended stdlib (golang.org/x); no third-party        |
| `github.com/rs/zerolog`                | Structured JSON logging             | Zero-allocation logger; stdlib `log/slog` has more overhead at high throughput |

Everything else — routing, middleware, JSON, env vars (`os.Getenv`), HTTP server, rate limiting (`sync.Map`) — is **pure stdlib**. No sqlc, no ORM. Zerolog is the one exception for logging (see below).

---

## File & Folder Structure

```
task_rival/
├── .github/
│   └── workflows/
│       ├── backend-ci.yml          # Go test + lint on PR
│       └── frontend-ci.yml         # Next.js type-check + vitest
│
├── backend/                        # Go service (deployed to Render)
│   ├── cmd/
│   │   └── server/
│   │       └── main.go             # Entry point: wire deps, run migrations, start server
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go           # os.Getenv into a typed Config struct
│   │   ├── database/
│   │   │   ├── postgres.go         # pgxpool setup + RunMigrations()
│   │   │   └── migrations/         # Plain SQL migration files only
│   │   │       ├── 000001_init.up.sql
│   │   │       ├── 000001_init.down.sql
│   │   │       ├── 000002_activity_log.up.sql
│   │   │       └── 000002_activity_log.down.sql
│   │   ├── model/
│   │   │   ├── task.go             # Task struct + status/priority constants
│   │   │   ├── user.go             # User struct + role constants
│   │   │   ├── attachment.go       # Attachment struct
│   │   │   └── activity.go         # ActivityLog struct
│   │   ├── repository/
│   │   │   ├── task_repo.go        # Raw SQL queries for tasks (pool.QueryRow, pool.Query)
│   │   │   ├── user_repo.go        # Raw SQL queries for users
│   │   │   ├── attachment_repo.go  # Raw SQL queries for attachments
│   │   │   ├── activity_repo.go    # Raw SQL queries for activity logs
│   │   │   └── token_repo.go       # Raw SQL queries for refresh tokens
│   │   ├── service/
│   │   │   ├── auth_service.go     # bcrypt, JWT generation, token rotation
│   │   │   ├── task_service.go     # business logic + SSE fan-out on mutations
│   │   │   └── upload_service.go   # Cloudinary signed URL generation
│   │   ├── handler/
│   │   │   ├── auth_handler.go     # POST /auth/signup, login, refresh, logout
│   │   │   ├── task_handler.go     # CRUD + search + sort handlers
│   │   │   ├── attachment_handler.go
│   │   │   ├── activity_handler.go
│   │   │   ├── sse_handler.go      # GET /events — SSE stream
│   │   │   └── health_handler.go   # GET /health
│   │   ├── middleware/
│   │   │   ├── auth.go             # JWT verification, injects userID into context
│   │   │   ├── admin.go            # role=admin check
│   │   │   ├── ratelimit.go        # per-IP token bucket (sync.Map)
│   │   │   └── logger.go           # zerolog request logging middleware
│   │   ├── sse/
│   │   │   └── broker.go           # in-memory SSE broker: map[userID]chan Event
│   │   └── validator/
│   │       └── validator.go        # manual field validation helpers
│   ├── Dockerfile                  # Multi-stage build
│   ├── .env.example
│   └── go.mod / go.sum             # deps: pgx/v5, golang-migrate, golang-jwt/jwt, google/uuid, x/crypto, zerolog
│
├── frontend/                       # Next.js app (deployed to Vercel)
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── signup/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx          # Protected layout with auth check
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx        # Task list view
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx    # Create task form
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx    # Task detail + edit
│   │   │   │       └── activity/
│   │   │   │           └── page.tsx
│   │   │   └── admin/
│   │   │       └── page.tsx        # Admin: all users' tasks
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── [...nextauth]/  # (optional NextAuth shim)
│   │   ├── layout.tsx              # Root layout + theme provider
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives (auto-generated)
│   │   ├── tasks/
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskForm.tsx        # Create + edit (shared)
│   │   │   ├── TaskFilters.tsx     # Status filter + search + sort
│   │   │   └── TaskAttachments.tsx
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── SignupForm.tsx
│   │   └── layout/
│   │       ├── Navbar.tsx
│   │       ├── Sidebar.tsx
│   │       └── ThemeToggle.tsx
│   ├── hooks/
│   │   ├── useTasks.ts             # TanStack Query hooks
│   │   ├── useSSE.ts               # SSE subscription hook
│   │   └── useOptimisticTask.ts    # Optimistic mutation helpers
│   ├── lib/
│   │   ├── api.ts                  # Axios instance with interceptors
│   │   ├── auth.ts                 # Token storage + refresh logic
│   │   └── utils.ts
│   ├── store/
│   │   ├── authStore.ts            # Zustand: user session
│   │   └── themeStore.ts           # Zustand: dark mode (persisted)
│   ├── types/
│   │   └── index.ts                # Shared TypeScript interfaces
│   ├── __tests__/
│   │   ├── TaskForm.test.tsx
│   │   ├── TaskList.test.tsx
│   │   └── api.test.ts
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── docker-compose.yml              # Full local stack
├── docker-compose.backend.yml      # Backend + DB only
├── Makefile                        # Developer shortcuts
└── README.md
```

---

## Backend Architecture

### Request Lifecycle

```
HTTP Request
    │
    ▼
net/http ServeMux  (Go 1.22 — "METHOD /path/{id}" pattern)
    │
    ├── chain() wraps each route with middleware
    │     ├── loggerMiddleware     (zerolog — structured JSON, zero alloc)
    │     ├── corsMiddleware       (ALLOWED_ORIGINS check)
    │     └── rateLimitMiddleware  (per-IP token bucket, sync.Map)
    │
    ▼
authMiddleware  (verify JWT, inject userID + role into context)
    │
    ▼
handler.TaskHandler  (or AuthHandler, AttachmentHandler, …)
    │  json.NewDecoder(r.Body).Decode(&req)
    │  validate(req)
    │
    ▼
service.TaskService  (business logic, orchestration)
    │  e.g. check ownership, build diff for activity log
    │
    ▼
repository.TaskRepo  (raw SQL via pgxpool.QueryRow / Query)
    │  writes to PostgreSQL (Supabase via PgBouncer)
    │
    ▼
service fan-out  →  sse.Broker.Publish(userID, event)
    │
    ▼
writeJSON(w, status, envelope{success, data, error, meta})
```

### Middleware Chaining Pattern

```go
// No framework needed — plain function composition
type Middleware func(http.Handler) http.Handler

func chain(h http.Handler, middlewares ...Middleware) http.Handler {
    for i := len(middlewares) - 1; i >= 0; i-- {
        h = middlewares[i](h)
    }
    return h
}

// Registration
mux.Handle("GET /tasks", chain(
    http.HandlerFunc(h.ListTasks),
    authMiddleware,
    loggerMiddleware,
    corsMiddleware,
))
```

### Path Parameter Extraction (Go 1.22+)

```go
// No router library needed
func (h *TaskHandler) GetTask(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")   // built-in since Go 1.22
    // ...
}
```

### Response Envelope

All responses follow this shape:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 142
  }
}
```

Error shape:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title is required",
    "fields": { "title": "required" }
  }
}
```

### Connection Pooling

Supabase exposes two connection strings:

- **Direct** (`db.xxx.supabase.co:5432`) — use for migrations only (golang-migrate needs a non-pooled connection for advisory locks)
- **Pooler / PgBouncer** (`aws-0-region.pooler.supabase.com:6543`) — use for all application queries (transaction mode, handles serverless bursts)

```go
// pgxpool config — connects through Supabase PgBouncer (transaction mode)
// PgBouncer handles the actual PostgreSQL connection cap (~60 on free tier)
pool, _ := pgxpool.NewWithConfig(ctx, &pgxpool.Config{
    MaxConns:          10,   // keep well under Supabase free tier limit
    MinConns:          2,
    MaxConnLifetime:   time.Hour,
    MaxConnIdleTime:   30 * time.Minute,
    HealthCheckPeriod: time.Minute,
    // PgBouncer transaction mode doesn't support prepared statements
    ConnConfig: func() *pgx.ConnConfig {
        cfg, _ := pgx.ParseConfig(os.Getenv("DATABASE_POOLER_URL"))
        cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
        return cfg
    }(),
})
```

---

## Frontend Architecture

### Data Flow

```
Page Component (RSC or Client)
    │
    ├── TanStack Query (useQuery / useMutation)
    │     │
    │     ├── Optimistic update applied immediately to cache
    │     ├── API call dispatched
    │     └── On error → cache rolled back automatically
    │
    ├── Zustand store (auth state, theme)
    │
    └── SSE hook (useSSE)
          │
          └── On event → queryClient.invalidateQueries(...)
                         (merges with optimistic state)
```

### Auth Token Strategy

- **Access token**: short-lived JWT (15 min), stored in memory (Zustand)
- **Refresh token**: long-lived (7 days), stored in `httpOnly` cookie
- Axios interceptor catches 401, silently calls `POST /auth/refresh`, retries original request
- On page refresh, Next.js middleware calls refresh endpoint server-side to rehydrate session

### Dark Mode

- `themeStore.ts` uses Zustand `persist` middleware (localStorage)
- Tailwind `darkMode: 'class'` strategy
- `ThemeToggle` component syncs class on `<html>` element

---

## Database Schema

```sql
-- Users
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,          -- bcrypt hash
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'todo',   -- 'todo' | 'in_progress' | 'done'
    priority    TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
    due_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attachments
CREATE TABLE attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    url         TEXT NOT NULL,
    size_bytes  INTEGER,
    mime_type   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity Log
CREATE TABLE activity_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,   -- 'created' | 'updated' | 'deleted' | 'status_changed' | 'attachment_added'
    diff        JSONB,           -- { before: {...}, after: {...} }
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_user_id         ON tasks(user_id);
CREATE INDEX idx_tasks_status          ON tasks(status);
CREATE INDEX idx_tasks_due_date        ON tasks(due_date);
CREATE INDEX idx_tasks_priority        ON tasks(priority);
CREATE INDEX idx_tasks_created_at      ON tasks(created_at);
CREATE INDEX idx_tasks_title_search    ON tasks USING gin(to_tsvector('english', title));
CREATE INDEX idx_activity_task_id      ON activity_logs(task_id);
CREATE INDEX idx_attachments_task_id   ON attachments(task_id);
```

---

## Authentication Flow

```
SIGNUP
  Client ──POST /auth/signup──► Handler
                                  │ validate email + password
                                  │ bcrypt.GenerateFromPassword(password, 12)
                                  │ INSERT user
                                  │ generate access_token (JWT, 15m)
                                  │ generate refresh_token (opaque, 7d)
                                  │ store SHA256(refresh_token) in DB
                                  └─► return { access_token } + Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Lax

LOGIN (same shape as signup response)

SILENT REFRESH (on 401 or page load)
  Client ──POST /auth/refresh──► Handler
    (cookie sent automatically)     │ read refresh_token from cookie
                                    │ hash it, look up in DB
                                    │ check not revoked + not expired
                                    │ issue new access_token
                                    └─► return { access_token }

LOGOUT
  Client ──POST /auth/logout──► Handler
                                  │ mark refresh_token as revoked in DB
                                  └─► Clear-Cookie: refresh_token
```

---

## Real-time Updates (SSE)

### Backend SSE Broker

```
SSE Broker (singleton, in-memory)
  │
  ├── map[userID] → chan Event
  │
  ├── Subscribe(userID) → (chan Event, unsubscribe func)
  └── Publish(userID, event Event)

On any task mutation:
  service.UpdateTask(...)
    └── broker.Publish(task.UserID, Event{Type: "task_updated", Payload: task})

Admin events: broker.PublishAll(event)  (for role=admin subscriptions)
```

### Frontend SSE Hook

```typescript
// useSSE.ts
export function useSSE() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource(`${API_URL}/events?token=${accessToken}`);
    es.onmessage = (e) => {
      const { type } = JSON.parse(e.data);
      if (
        type === "task_updated" ||
        type === "task_created" ||
        type === "task_deleted"
      ) {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      }
    };
    return () => es.close();
  }, [accessToken]);
}
```

---

## Optimistic UI & Rollback

TanStack Query's `onMutate` / `onError` / `onSettled` pattern:

```typescript
// hooks/useOptimisticTask.ts
const updateTask = useMutation({
  mutationFn: (data) => api.patch(`/tasks/${data.id}`, data),

  onMutate: async (newTask) => {
    await queryClient.cancelQueries({ queryKey: ["tasks"] });
    const snapshot = queryClient.getQueryData(["tasks"]); // save snapshot
    queryClient.setQueryData(["tasks"], (old) =>
      old.map((t) => (t.id === newTask.id ? { ...t, ...newTask } : t)),
    );
    return { snapshot }; // return for rollback
  },

  onError: (_err, _newTask, context) => {
    queryClient.setQueryData(["tasks"], context.snapshot); // ROLLBACK
    toast.error("Update failed — changes reverted");
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] }); // sync with server
  },
});
```

Same pattern is applied to `createTask` (append to list) and `deleteTask` (remove from list).

---

## File Uploads

### Flow (Direct Upload to Cloudinary)

```
1. Client requests signed upload URL
   GET /tasks/:id/attachments/upload-url
       └─► backend calls Cloudinary API to generate signed URL + upload preset
           returns { upload_url, signature, timestamp, api_key }

2. Client uploads directly to Cloudinary (bypasses backend, no bandwidth cost)
   POST https://api.cloudinary.com/v1_1/{cloud}/upload
       └─► returns { secure_url, public_id, bytes, format }

3. Client registers attachment record
   POST /tasks/:id/attachments
       body: { filename, url, size_bytes, mime_type }
       └─► backend validates URL is from Cloudinary domain, inserts attachment record
           publishes SSE event
```

### Constraints

- Max file size: 10 MB (enforced client-side + Cloudinary upload preset)
- Allowed MIME types: `image/*`, `application/pdf`, `text/*`

---

## Activity Log

Every write operation in the task service records a diff. The service orchestrates two repository calls:

```go
// service/task_service.go
func (s *TaskService) UpdateTask(ctx context.Context, id uuid.UUID, userID uuid.UUID, req UpdateTaskRequest) (*model.Task, error) {
    existing, err := s.taskRepo.GetByID(ctx, id, userID)
    if err != nil {
        return nil, err
    }

    updated, err := s.taskRepo.Update(ctx, id, userID, req)
    if err != nil {
        return nil, err
    }

    diff, _ := json.Marshal(map[string]any{"before": existing, "after": updated})
    _ = s.activityRepo.Create(ctx, &model.ActivityLog{
        TaskID: id,
        UserID: userID,
        Action: "updated",
        Diff:   diff,
    })

    s.broker.Publish(userID, sse.Event{Type: "task_updated", Payload: updated})
    return updated, nil
}

// repository/task_repo.go
func (r *TaskRepo) Update(ctx context.Context, id, userID uuid.UUID, req UpdateTaskRequest) (*model.Task, error) {
    query := `
        UPDATE tasks SET
            title       = COALESCE($3, title),
            description = COALESCE($4, description),
            status      = COALESCE($5, status),
            priority    = COALESCE($6, priority),
            due_date    = COALESCE($7, due_date),
            updated_at  = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, title, description, status, priority, due_date, created_at, updated_at`

    row := r.pool.QueryRow(ctx, query, id, userID,
        req.Title, req.Description, req.Status, req.Priority, req.DueDate)

    var t model.Task
    err := row.Scan(&t.ID, &t.UserID, &t.Title, &t.Description,
        &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
    if err != nil {
        return nil, fmt.Errorf("task update: %w", err)
    }
    return &t, nil
}
```

---

## Docker Setup

### `docker-compose.yml` — Full stack (frontend + backend + db)

> **Note:** Docker Compose uses a local Postgres container for development. Supabase is used only in production (Render + Vercel). There is no local Supabase dependency — the app connects to Supabase only when deployed.

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: taskpass
      POSTGRES_DB: taskdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskuser -d taskdb"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      # Local dev: both vars point to the same local Postgres (no PgBouncer needed)
      DATABASE_URL: postgres://taskuser:taskpass@postgres:5432/taskdb?sslmode=disable
      DATABASE_POOLER_URL: postgres://taskuser:taskpass@postgres:5432/taskdb?sslmode=disable
      JWT_SECRET: local-dev-secret-change-in-prod
      CLOUDINARY_URL: ${CLOUDINARY_URL}
      PORT: 8080
      ENV: development
      ALLOWED_ORIGINS: http://localhost:3000
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
```

### `docker-compose.backend.yml` — Backend + DB only (for frontend local dev)

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: taskpass
      POSTGRES_DB: taskdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U taskuser -d taskdb"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://taskuser:taskpass@postgres:5432/taskdb?sslmode=disable
      DATABASE_POOLER_URL: postgres://taskuser:taskpass@postgres:5432/taskdb?sslmode=disable
      JWT_SECRET: local-dev-secret-change-in-prod
      PORT: 8080
      ENV: development
      ALLOWED_ORIGINS: http://localhost:3000
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

### Backend `Dockerfile` — Multi-stage build

```dockerfile
# Stage 1: build
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -ldflags="-s -w" -o server ./cmd/server

# Stage 2: minimal runtime image (~15 MB)
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
```

### Frontend `Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Makefile — Developer Commands

```makefile
.PHONY: up up-backend up-frontend down logs migrate test

# Start full stack with one command
up:
	docker compose up --build

# Start only backend + DB (run frontend with `npm run dev` separately)
up-backend:
	docker compose -f docker-compose.backend.yml up --build

# Start only frontend (assumes backend running)
up-frontend:
	cd frontend && npm install && npm run dev

# Stop all containers
down:
	docker compose down

# Tail logs
logs:
	docker compose logs -f

# Run DB migrations manually
migrate:
	docker compose exec backend ./server migrate

# Run all tests
test:
	cd backend && go test ./...
	cd frontend && npm run test

# Run backend tests only
test-backend:
	cd backend && go test ./... -v -race

# Run frontend tests only
test-frontend:
	cd frontend && npm run test

# Rebuild without cache
rebuild:
	docker compose up --build --force-recreate
```

---

## Deployment Strategy

### Backend → Render.com

1. Connect GitHub repo to Render, point root to `./backend`
2. Set Build Command: `go build -o server ./cmd/server`
3. Set Start Command: `./server`
4. Set environment variables in Render dashboard (see `.env.example`)
5. Copy both Supabase connection strings into Render env vars (`DATABASE_URL` for migrations, `DATABASE_POOLER_URL` for app queries)
6. Enable health check: `GET /health` → 200
7. Render auto-deploys on push to `main`

**Zero-downtime deploys**: Render's web services swap instances only after the new instance passes health checks.

### Database → Supabase

1. Create a new Supabase project (free tier: 500 MB storage, 2 vCPU, 1 GB RAM)
2. Go to **Project Settings → Database** to find both connection strings:
   - **Direct URL** (`postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres`) → `DATABASE_URL` — used only by golang-migrate (needs non-pooled connection for advisory locks)
   - **Pooler URL / Transaction mode** (`postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres`) → `DATABASE_POOLER_URL` — used by the app at runtime
3. In **Project Settings → Network**, add Render's outbound IPs to the allowlist (or temporarily allow all IPs for free tier Render which uses dynamic IPs)
4. Migrations run on every deploy via `golang-migrate` against `DATABASE_URL` before the new binary starts serving traffic

### Frontend → Vercel

1. Import GitHub repo, set root directory to `./frontend`
2. Vercel auto-detects Next.js; no build config needed
3. Set `NEXT_PUBLIC_API_URL` to your Render backend URL
4. Each PR gets a preview deployment automatically

### Database Migrations on Deploy

The backend `main.go` runs `golang-migrate` on startup before accepting connections:

```go
// Runs pending migrations; no-ops if already applied
// golang-migrate is the ONE allowed external dep for migrations
if err := db.RunMigrations(cfg.DatabaseURL); err != nil {
    log.Fatal("migration failed:", err)
}
```

This means: push backend → Render rebuilds → migration runs → new binary starts. Safe for additive migrations (add columns, add tables). Breaking migrations (drop column) require a two-deploy strategy.

---

## Failure Points & Mitigations

| #   | Failure Point                                          | Likelihood | Impact | Mitigation                                                                                              |
| --- | ------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 1   | **Render free tier cold start**                        | High       | Medium | Keep-alive ping (UptimeRobot free tier hits `/health` every 5 min to prevent spin-down)                 |
| 2   | **PostgreSQL connection exhaustion**                   | Medium     | High   | App connects via Supabase PgBouncer (transaction mode); `pgxpool MaxConns=10`; PgBouncer handles the actual DB connection cap (~60 on free tier) |
| 3   | **JWT access token stolen (XSS)**                      | Low        | High   | Access token in memory only (never localStorage); CSP headers via Next.js middleware                    |
| 4   | **Refresh token replay attack**                        | Low        | High   | Token rotation: each refresh invalidates old token and issues new one; stored as SHA-256 hash           |
| 5   | **SSE connection drops (mobile/proxy)**                | High       | Low    | Client reconnects automatically; `EventSource` retries with exponential backoff built-in                |
| 6   | **Optimistic update diverges from server**             | Medium     | Low    | `onSettled` always calls `invalidateQueries` to sync; `onError` rolls back immediately                  |
| 7   | **Cloudinary signed URL misuse**                       | Low        | Medium | URL expires in 60s; backend validates returned URL domain before inserting attachment                   |
| 8   | **Breaking DB migration on deploy**                    | Low        | High   | Two-phase deploy: (1) add new column nullable, deploy; (2) backfill + add constraint, deploy            |
| 9   | **Render service crashes (OOM)**                       | Low        | High   | Distroless binary ~15 MB; Go GC tuned with `GOGC=50`; Render auto-restarts on crash                     |
| 10  | **CORS misconfiguration blocking Vercel preview URLs** | Medium     | Medium | `ALLOWED_ORIGINS` env var supports comma-separated list + wildcard for `*.vercel.app`                   |
| 11  | **Rate limit bypass via header spoofing**              | Medium     | Medium | Rate limit on `X-Real-IP` with fallback to socket IP; Render sets `X-Forwarded-For`                     |
| 12  | **Admin endpoint privilege escalation**                | Low        | High   | `role` field is server-set only; checked in middleware before handler; never accepted from client input |
| 13  | **N+1 query on task list with attachments**            | Medium     | Medium | Single JOIN query via sqlc; attachment count returned as aggregate, not separate fetch                  |
| 14  | **Stale SSE connection holding DB conn**               | Medium     | Medium | SSE handler uses context cancellation; no DB conn held open during SSE stream                           |
| 15  | **Vercel edge / Render origin latency**                | Medium     | Low    | TanStack Query `staleTime` reduces redundant round-trips; SSE invalidation fills the gap                |

---

## Environment Variables

### `backend/.env.example`

```env
# Server
PORT=8080
ENV=development                              # development | production

# Database — Supabase
# Direct connection: used only by golang-migrate (non-pooled, supports advisory locks)
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
# Pooler connection: used by the app at runtime (PgBouncer transaction mode)
DATABASE_POOLER_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Auth
JWT_SECRET=change-me-in-production          # min 32 chars, random
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=168h                      # 7 days

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app

# Cloudinary
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

### `frontend/.env.example`

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## API Reference

### Auth

| Method | Path            | Auth   | Description                 |
| ------ | --------------- | ------ | --------------------------- |
| POST   | `/auth/signup`  | No     | Register new user           |
| POST   | `/auth/login`   | No     | Login, returns access token |
| POST   | `/auth/refresh` | Cookie | Rotate refresh token        |
| POST   | `/auth/logout`  | JWT    | Revoke refresh token        |

### Tasks

| Method | Path                                | Auth | Description                                 |
| ------ | ----------------------------------- | ---- | ------------------------------------------- |
| GET    | `/tasks`                            | JWT  | List tasks (filter, search, sort, paginate) |
| POST   | `/tasks`                            | JWT  | Create task                                 |
| GET    | `/tasks/:id`                        | JWT  | Get single task                             |
| PATCH  | `/tasks/:id`                        | JWT  | Update task (partial)                       |
| DELETE | `/tasks/:id`                        | JWT  | Delete task                                 |
| GET    | `/tasks/:id/activity`               | JWT  | Get activity log for task                   |
| GET    | `/tasks/:id/attachments/upload-url` | JWT  | Get signed Cloudinary upload URL            |
| POST   | `/tasks/:id/attachments`            | JWT  | Register attachment after upload            |

### Admin

| Method | Path           | Auth        | Description      |
| ------ | -------------- | ----------- | ---------------- |
| GET    | `/admin/tasks` | JWT + admin | All users' tasks |
| GET    | `/admin/users` | JWT + admin | List all users   |

### System

| Method | Path      | Auth              | Description                         |
| ------ | --------- | ----------------- | ----------------------------------- |
| GET    | `/health` | No                | Health check (Render + UptimeRobot) |
| GET    | `/events` | JWT (query param) | SSE stream for real-time updates    |

### Query Parameters for `GET /tasks`

| Param      | Type   | Example    | Description                                      |
| ---------- | ------ | ---------- | ------------------------------------------------ |
| `status`   | string | `todo`     | Filter by status                                 |
| `q`        | string | `meeting`  | Full-text search on title                        |
| `sort`     | string | `due_date` | Sort field: `due_date`, `priority`, `created_at` |
| `order`    | string | `asc`      | Sort direction: `asc`, `desc`                    |
| `page`     | int    | `2`        | Page number (1-indexed)                          |
| `per_page` | int    | `20`       | Items per page (max 100)                         |

---

## Rollback Strategy

### Application Rollback (Render)

Render keeps the last 5 successful deploy images. To rollback:

1. Go to Render dashboard → Service → Deploys
2. Click the previous successful deploy → **Redeploy**
3. Render swaps instances with zero downtime (same health check gate)

### Database Rollback

Each migration has a corresponding `.down.sql` file. Run via:

```bash
# From inside the running container or locally with DATABASE_URL set
migrate -path ./internal/db/migrations -database $DATABASE_URL down 1
```

**Rule**: Never write a migration without a valid `.down.sql`. Destructive operations (DROP COLUMN) in `.down.sql` must be reviewed — only safe if no data was written to that column in production.

### Frontend Rollback (Vercel)

1. Vercel dashboard → Deployments
2. Find the last stable deployment → **Promote to Production**
3. Instant (no rebuild required, Vercel keeps immutable deployment artifacts)

### Rollback Decision Matrix

| Scenario                                | Action                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Bug in business logic, no schema change | Redeploy previous backend on Render                                                        |
| Bad migration (additive only)           | Run `migrate down 1`, redeploy previous backend                                            |
| Bad migration (dropped column)          | Point-in-time restore from Supabase (daily backups on free tier; PITR on Pro)              |
| Frontend regression                     | Promote previous Vercel deployment                                                         |
| Compromised JWT secret                  | Rotate `JWT_SECRET` env var → all existing tokens immediately invalid → all users re-login |
