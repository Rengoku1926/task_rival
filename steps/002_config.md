# Step 002 — Config

Read all environment variables once at startup into a typed `Config` struct. Every other package receives `*config.Config` — nothing calls `os.Getenv` outside this file.

## File: `internal/config/config.go`

```go
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port              string
	Env               string
	DatabaseURL       string // direct connection — used only by migrations
	DatabasePoolerURL string // PgBouncer transaction mode — used by the app
	JWTSecret         string
	AccessTokenTTL    time.Duration
	RefreshTokenTTL   time.Duration
	AllowedOrigins    []string
	CloudinaryURL     string
}

// Load reads environment variables and returns a validated Config.
// It returns an error if any required variable is missing.
func Load() (*Config, error) {
	cfg := &Config{
		Port:              getEnv("PORT", "8080"),
		Env:               getEnv("ENV", "development"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		DatabasePoolerURL: os.Getenv("DATABASE_POOLER_URL"),
		JWTSecret:         os.Getenv("JWT_SECRET"),
		CloudinaryURL:     os.Getenv("CLOUDINARY_URL"),
	}

	// Required fields
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.DatabasePoolerURL == "" {
		// fall back to direct URL (local dev uses the same URL for both)
		cfg.DatabasePoolerURL = cfg.DatabaseURL
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	var err error
	cfg.AccessTokenTTL, err = parseDuration(getEnv("ACCESS_TOKEN_TTL", "15m"))
	if err != nil {
		return nil, fmt.Errorf("ACCESS_TOKEN_TTL: %w", err)
	}
	cfg.RefreshTokenTTL, err = parseDuration(getEnv("REFRESH_TOKEN_TTL", "168h"))
	if err != nil {
		return nil, fmt.Errorf("REFRESH_TOKEN_TTL: %w", err)
	}

	origins := getEnv("ALLOWED_ORIGINS", "http://localhost:3000")
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	return cfg, nil
}

// IsProd returns true when running in production.
func (c *Config) IsProd() bool {
	return c.Env == "production"
}

// --- helpers ----------------------------------------------------------------

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDuration(s string) (time.Duration, error) {
	return time.ParseDuration(s)
}

// getEnvInt is available for future use.
func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
```

## File: `backend/.env.example`

```env
# Server
PORT=8080
ENV=development                         # development | production

# Database — Supabase
# Direct (used only for migrations — needs non-pooled connection)
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
# Pooler — Transaction mode (used by the app at runtime)
DATABASE_POOLER_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Auth
JWT_SECRET=change-me-to-a-random-32-char-string
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=168h

# CORS  — comma-separated, supports *.vercel.app wildcard
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app

# Cloudinary (for file attachments)
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

## Verify

In `cmd/server/main.go` (temporary — will be replaced in step 012):

```go
package main

import (
	"fmt"
	"log"

	"github.com/prateekmahapatra/task_rival/backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Config loaded: port=%s env=%s\n", cfg.Port, cfg.Env)
}
```

```bash
cd backend
cp .env.example .env   # fill in values
export $(cat .env | xargs)
go run ./cmd/server
# Config loaded: port=8080 env=development
```
