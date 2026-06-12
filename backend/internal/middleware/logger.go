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