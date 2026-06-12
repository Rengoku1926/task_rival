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