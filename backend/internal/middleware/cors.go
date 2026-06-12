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