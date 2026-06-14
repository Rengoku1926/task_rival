# Task Rival
<img width="1447" height="762" alt="image" src="https://github.com/user-attachments/assets/b65ea77f-8df5-428a-9f5f-f67deb29a9fb" />



A full-stack task management app — Next.js frontend, Go REST API backend, PostgreSQL (Supabase) database.

## Stack

- **Frontend**: Next.js (App Router), TypeScript, Zustand
- **Backend**: Go (stdlib `net/http`), pgx, JWT auth, zerolog
- **Database**: PostgreSQL (Supabase)
- **File storage**: Cloudinary (task attachments)

## What's covered

**Task 1 — Backend API**
- Full CRUD on `/tasks` (`POST`, `GET` list with status filter + pagination, `GET /:id`, `PATCH`, `DELETE`)
- Input validation on all write endpoints (`internal/validator`)
- Consistent JSON success/error response shape with proper HTTP status codes

**Task 2 — Auth**
- Signup/login with JWT access + refresh tokens, passwords hashed with bcrypt
- All task routes protected; users only see/modify their own tasks
- Refresh token stored in an httpOnly cookie so a page refresh keeps the user logged in

**Task 3 — Frontend**
- Task list with status filter, pagination, create/edit form with client-side validation
- Mark complete / delete from the UI
- Loading, empty, and error states handled
- Responsive layout (mobile + desktop)

**Task 4 — Search & Sort**
- Search tasks by title
- Sort by due date, priority, created date (asc/desc)
- Search, filters, and sort all compose together via query params

**Task 5 — Deliverables**
- Setup instructions below
- `.env.example` in `backend/`
- Backend integration tests in `backend/internal/service/` (signup, create task, update task)
- Dockerized local setup (`docker-compose.yml` + `docker-compose.backend.yml`)

**Bonus features implemented**
- Role-based access: `admin` role can list all users' tasks (`GET /admin/tasks`)
- Real-time updates via SSE (`/events`) — task create/update/delete pushed live to the client
- Task attachments via Cloudinary
- Activity log per task (`GET /tasks/:id/activity`)
- Dark mode toggle (persisted)
- Dockerized one-command local setup
- Rate limiting middleware on all routes
- CI pipeline (GitHub Actions) — runs build/vet/tests on backend changes and build/lint on frontend changes

**Not implemented**
- Optimistic UI with rollback

## Running locally

### Option 1: Docker (full stack)

```bash
make up
```

Starts Postgres, backend (`:8080`), and frontend (`:3000`) together. Migrations run automatically on backend startup.

### Option 2: Backend in Docker, frontend with hot reload

```bash
make up-backend     # Postgres + backend in Docker
make up-frontend    # frontend dev server with hot reload
```

### Option 3: Run everything manually

```bash
# Backend
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, etc.
go run ./cmd/server

# Frontend
cd frontend
cp .env.example .env   # set NEXT_PUBLIC_API_URL
npm install
npm run dev
```

## Tests

```bash
make test            # backend + frontend
make test-backend    # go test ./... -v -race
```

Backend integration tests need `TEST_DATABASE_URL` set in `backend/.env` (they're skipped if it's not set).

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list. Key ones:

- `DATABASE_URL` — Postgres connection string (Supabase session pooler recommended)
- `JWT_SECRET` — used to sign access/refresh tokens
- `ALLOWED_ORIGINS` — comma-separated list of allowed CORS origins
- `CLOUDINARY_URL` — for attachment uploads
- `NEXT_PUBLIC_API_URL` — backend URL the frontend calls

## Assumptions & trade-offs

- Used Supabase's session pooler instead of a direct connection — the direct connection is IPv6-only and unreachable from some hosting providers (Railway/Render).
- Refresh tokens are stored hashed in the DB and rotated on use.
- Rate limiting is a simple in-memory fixed-window counter — fine for a single instance, would need a shared store (Redis) for multi-instance deployments.
- Optimistic UI updates were skipped in favor of SSE-driven live updates, which keep state consistent across tabs/devices without client-side rollback logic.

## Deployment

- Frontend: Vercel
- Backend: Render (Docker)
- Database: Supabase
