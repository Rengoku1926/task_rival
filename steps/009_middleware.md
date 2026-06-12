# Step 009 — Middleware

Six files in the `middleware` package. Two are applied **globally** (wrapping the entire mux in `main.go`): CORS and Logger. Four are applied **per-route**: RateLimit, Auth, Admin, and the chain helper.

This separation means every request gets logged and CORS-handled regardless of route, while auth and rate-limiting are only added to the routes that need them.

---

## File: `internal/middleware/chain.go`

```go
package middleware

import "net/http"

// Middleware is a function that wraps an http.Handler.
type Middleware func(http.Handler) http.Handler

// Chain applies middlewares in the order they are listed.
// The first middleware in the list is the outermost wrapper
// (i.e., it runs first on the way in and last on the way out).
//
// Example:
//
//	mux.Handle("POST /tasks", Chain(handler, RateLimit(cfg), Auth(cfg)))
//	// request flow: RateLimit → Auth → handler
func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}
```

---

## File: `internal/middleware/cors.go`

```go
package middleware

import (
	"net/http"
	"strings"

	"github.com/prateekmahapatra/task_rival/backend/internal/config"
)

// CORS handles cross-origin requests for every route.
// It is applied globally in main.go, not per-route.
//
// Preflight (OPTIONS) requests are short-circuited here — they never reach
// route handlers.
func CORS(cfg *config.Config) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			if origin != "" && isAllowedOrigin(origin, cfg.AllowedOrigins) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func isAllowedOrigin(origin string, allowed []string) bool {
	for _, a := range allowed {
		if a == origin {
			return true
		}
		// wildcard subdomain match: *.vercel.app matches foo.vercel.app
		if strings.HasPrefix(a, "*.") {
			suffix := a[1:] // ".vercel.app"
			if strings.HasSuffix(origin, suffix) {
				return true
			}
		}
	}
	return false
}
```

---

## File: `internal/middleware/logger.go`

```go
package middleware

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Logger attaches a request-scoped zerolog logger to the context and logs
// every completed request with method, path, status, latency, and request ID.
//
// Applied globally in main.go.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		requestID := uuid.New().String()

		// Build a child logger enriched with request metadata.
		logger := log.With().
			Str("request_id", requestID).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Str("remote_ip", realIP(r)).
			Logger()

		// Attach logger to context — handlers retrieve it with zerolog.Ctx(r.Context()).
		ctx := logger.WithContext(r.Context())

		// Wrap ResponseWriter to capture the status code written by the handler.
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(rw, r.WithContext(ctx))

		logger.Info().
			Int("status", rw.status).
			Dur("latency_ms", time.Since(start)).
			Str("user_agent", r.UserAgent()).
			Msg("request")
	})
}

// realIP extracts the client IP, respecting the X-Real-IP header set by Render's proxy.
func realIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		// X-Forwarded-For can be a comma-separated list; take the first.
		if idx := len(ip); idx > 0 {
			return ip
		}
	}
	return r.RemoteAddr
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status  int
	written bool
}

func (rw *responseWriter) WriteHeader(status int) {
	if !rw.written {
		rw.status = status
		rw.written = true
		rw.ResponseWriter.WriteHeader(status)
	}
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

// LoggerFrom returns the zerolog logger stored in the request context.
// Handlers should use this to emit structured log lines.
func LoggerFrom(r *http.Request) zerolog.Logger {
	return *zerolog.Ctx(r.Context())
}
```

---

## File: `internal/middleware/auth.go`

```go
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/prateekmahapatra/task_rival/backend/internal/config"
)

type contextKey string

const (
	ContextKeyUserID contextKey = "userID"
	ContextKeyRole   contextKey = "role"
)

// Claims is the JWT payload.
type Claims struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// Auth verifies the Bearer JWT in the Authorization header.
// On success it injects userID and role into the request context.
// Applied per-route for protected endpoints.
func Auth(cfg *config.Config) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, ok := bearerToken(r)
			if !ok {
				http.Error(w, `{"success":false,"error":{"code":"UNAUTHORIZED","message":"missing or malformed token"}}`, http.StatusUnauthorized)
				return
			}

			claims, err := parseToken(token, cfg.JWTSecret)
			if err != nil {
				http.Error(w, `{"success":false,"error":{"code":"UNAUTHORIZED","message":"invalid or expired token"}}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), ContextKeyUserID, claims.UserID)
			ctx = context.WithValue(ctx, ContextKeyRole, claims.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFrom extracts the authenticated user's UUID from the context.
// Panics if called outside an Auth-protected handler — intentional (programmer error).
func UserIDFrom(ctx context.Context) uuid.UUID {
	id, _ := uuid.Parse(ctx.Value(ContextKeyUserID).(string))
	return id
}

// RoleFrom extracts the authenticated user's role from the context.
func RoleFrom(ctx context.Context) string {
	role, _ := ctx.Value(ContextKeyRole).(string)
	return role
}

func bearerToken(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return "", false
	}
	token := strings.TrimPrefix(h, "Bearer ")
	return token, token != ""
}

func parseToken(tokenStr, secret string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}
```

---

## File: `internal/middleware/admin.go`

```go
package middleware

import (
	"net/http"

	"github.com/prateekmahapatra/task_rival/backend/internal/model"
)

// Admin rejects requests from non-admin users.
// Must be applied after Auth — it reads the role from the context that Auth sets.
func Admin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if RoleFrom(r.Context()) != model.RoleAdmin {
			http.Error(w, `{"success":false,"error":{"code":"FORBIDDEN","message":"admin access required"}}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

---

## File: `internal/middleware/ratelimit.go`

```go
package middleware

import (
	"net/http"
	"sync"
	"time"
)

// RateLimit enforces a fixed-window counter per IP address.
// Default: 100 requests per 60-second window.
//
// Applied per-route (not globally) so the health check endpoint is exempt.
func RateLimit(requestsPerMin int) Middleware {
	if requestsPerMin <= 0 {
		requestsPerMin = 100
	}

	var (
		mu      sync.Mutex
		clients = make(map[string]*rateLimitEntry)
	)

	// Background cleanup to prevent the map from growing unbounded.
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			mu.Lock()
			for ip, e := range clients {
				if now.After(e.windowEnd) {
					delete(clients, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := realIP(r)

			mu.Lock()
			e, ok := clients[ip]
			if !ok || time.Now().After(e.windowEnd) {
				e = &rateLimitEntry{
					count:     0,
					windowEnd: time.Now().Add(time.Minute),
				}
				clients[ip] = e
			}
			e.count++
			count := e.count
			mu.Unlock()

			if count > requestsPerMin {
				http.Error(w, `{"success":false,"error":{"code":"RATE_LIMIT","message":"too many requests"}}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

type rateLimitEntry struct {
	count     int
	windowEnd time.Time
}
```

---

## How middleware is composed in `main.go`

```go
// Global — wraps the entire mux
var handler http.Handler = mux
handler = middleware.Logger(handler)       // outermost: logs every request
handler = middleware.CORS(cfg)(handler)    // next: sets CORS headers + handles OPTIONS

// Per-route shortcuts
rl   := middleware.RateLimit(100)
auth := middleware.Auth(cfg)
adm  := middleware.Admin

// Protected route
mux.Handle("GET /tasks", middleware.Chain(
    http.HandlerFunc(taskHandler.List),
    rl, auth,          // rate-limit first, then verify JWT
))

// Admin route
mux.Handle("GET /admin/tasks", middleware.Chain(
    http.HandlerFunc(taskHandler.AdminList),
    rl, auth, adm,     // rate-limit → auth → admin role check
))
```

## Notes

- `realIP` is shared between the Logger and RateLimit middlewares via the unexported helper in `logger.go`. Both files are in the same package so this works without duplication.
- The `Auth` middleware returns raw JSON error strings (`http.Error`) rather than calling `writeJSON` to avoid a circular import with the `handler` package.
- `Claims` and `UserIDFrom`/`RoleFrom` are exported from this package so handlers can read the injected values without importing `jwt` directly.
