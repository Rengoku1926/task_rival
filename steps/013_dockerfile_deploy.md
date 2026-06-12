# Step 013 — Dockerfile & Deploy

Multi-stage Dockerfile that produces a minimal ~15 MB binary image. Deploy instructions for Render (backend) and Supabase (database).

---

## File: `backend/Dockerfile`

```dockerfile
# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Download dependencies first (cached unless go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o server \
    ./cmd/server

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
# distroless has no shell — attackers can't exec into the container
FROM gcr.io/distroless/static-debian12

COPY --from=builder /app/server /server

EXPOSE 8080

ENTRYPOINT ["/server"]
```

---

## File: `backend/.env.example`

```env
# ── Server ───────────────────────────────────────────────────────────────────
PORT=8080
ENV=development                              # development | production

# ── Database — Supabase ──────────────────────────────────────────────────────
# Direct connection: used ONLY by golang-migrate (migrations need advisory locks)
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres

# Pooler connection (PgBouncer, transaction mode): used by the app at runtime
# Note: QueryExecModeSimpleProtocol is set in database/postgres.go for this URL
DATABASE_POOLER_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# ── Auth ─────────────────────────────────────────────────────────────────────
JWT_SECRET=replace-with-32-or-more-random-characters
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=168h                       # 7 days

# ── CORS ─────────────────────────────────────────────────────────────────────
# Comma-separated. Supports *.vercel.app wildcard prefix.
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app

# ── Cloudinary (optional — required only for file attachment feature) ────────
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

---

## File: `docker-compose.yml` (project root)

```yaml
version: "3.9"

# Local dev: uses a local Postgres container.
# Supabase is production-only — no local dependency on it.

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
      # In local dev both vars point to the same local Postgres
      DATABASE_URL: postgres://taskuser:taskpass@postgres:5432/taskdb?sslmode=disable
      DATABASE_POOLER_URL: postgres://taskuser:taskpass@postgres:5432/taskdb?sslmode=disable
      JWT_SECRET: local-dev-secret-change-in-production
      PORT: "8080"
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

---

## File: `docker-compose.backend.yml` (project root)

```yaml
version: "3.9"

# Backend + DB only.
# Run frontend separately with: cd frontend && npm run dev

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
      JWT_SECRET: local-dev-secret-change-in-production
      PORT: "8080"
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

---

## File: `Makefile` (project root)

```makefile
.PHONY: up up-backend up-frontend down logs rebuild test test-backend test-frontend

## Start full stack (frontend + backend + DB)
up:
	docker compose up --build

## Start backend + DB only (run frontend separately with `npm run dev`)
up-backend:
	docker compose -f docker-compose.backend.yml up --build

## Start frontend only (assumes backend is already running)
up-frontend:
	cd frontend && npm install && npm run dev

## Stop all containers
down:
	docker compose down

## Tail logs from all containers
logs:
	docker compose logs -f

## Rebuild without layer cache
rebuild:
	docker compose up --build --force-recreate

## Run all tests
test: test-backend test-frontend

## Run backend tests
test-backend:
	cd backend && go test ./... -v -race

## Run frontend tests
test-frontend:
	cd frontend && npm run test
```

---

## Deploy to Render

### Step-by-step

1. **Create a Render account** at render.com

2. **New Web Service** → Connect GitHub repo → select `task_rival`

3. **Settings**:
   - Root Directory: `backend`
   - Runtime: Docker (Render detects the Dockerfile automatically)
   - Branch: `main`

4. **Environment variables** (Render dashboard → Environment tab):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Supabase direct URL |
   | `DATABASE_POOLER_URL` | Supabase pooler URL |
   | `JWT_SECRET` | random 32+ char string |
   | `ACCESS_TOKEN_TTL` | `15m` |
   | `REFRESH_TOKEN_TTL` | `168h` |
   | `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
   | `ENV` | `production` |
   | `PORT` | `8080` |
   | `CLOUDINARY_URL` | from Cloudinary dashboard |

5. **Health Check Path**: `/health`

6. **Auto-deploy**: enabled on push to `main`

### Zero-downtime deploys

Render waits for `/health` to return 200 on the new instance before routing traffic. Migrations run on startup before the server accepts requests — schema changes are applied before any request hits the new code.

---

## Supabase setup

1. Create a project at supabase.com
2. **Project Settings → Database → Connection string**:
   - Copy `URI` (direct) → `DATABASE_URL`
   - Copy `URI` under **Connection Pooling** → Transaction mode → `DATABASE_POOLER_URL`
3. **Project Settings → Network**:
   - Free tier Render uses dynamic IPs — enable "Allow all IPs" temporarily, or upgrade to Render's paid plan for static outbound IPs

---

## Verify production deployment

```bash
# Health check
curl https://your-api.onrender.com/health

# Signup
curl -X POST https://your-api.onrender.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Login
curl -X POST https://your-api.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

---

## Rollback

| Scenario | Action |
|---|---|
| Bug in business logic | Render dashboard → Deploys → previous deploy → Redeploy |
| Bad additive migration | `migrate -path ./internal/database/migrations -database $DATABASE_URL down 1` then redeploy previous |
| Bad destructive migration | Supabase dashboard → Backups → restore point-in-time |
| Compromised `JWT_SECRET` | Rotate the env var in Render → all existing tokens are immediately invalid → users re-login |
