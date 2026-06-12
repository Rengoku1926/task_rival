package handler

import (
	"fmt"
	"net/http"

	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/sse"
	"github.com/rs/zerolog"
)

type SSEHandler struct {
	broker *sse.Broker
	cfg    interface{ JWTSecret() string } // avoid importing config directly
}

// SSEHandlerDeps holds what the SSE handler needs.
type SSEHandlerDeps struct {
	Broker    *sse.Broker
	JWTSecret string
}

type SSEHandler2 struct {
	broker    *sse.Broker
	jwtSecret string
}

func NewSSEHandler(broker *sse.Broker, jwtSecret string) *SSEHandler2 {
	return &SSEHandler2{broker: broker, jwtSecret: jwtSecret}
}

// GET /events?token=<access_token>
//
// EventSource (browser API) cannot set custom headers, so the JWT is passed
// as a query parameter. We verify it here instead of in the Auth middleware.
func (h *SSEHandler2) Stream(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	// Verify token from query parameter.
	token := r.URL.Query().Get("token")
	if token == "" {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "token required", nil)
		return
	}

	// Reuse the same parseToken helper from the middleware package.
	// We inline a minimal config struct to avoid circular imports.
	type minCfg struct{ JWTSecret string }

	claims, err := parseTokenStr(token, h.jwtSecret)
	if err != nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "invalid token", nil)
		return
	}

	userID := middleware.UserIDFrom(
		withUserContext(r.Context(), claims.UserID, claims.Role),
	)

	// Verify the client supports flushing.
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, codeInternal, "streaming not supported", nil)
		return
	}

	// Set SSE headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable Nginx buffering
	w.WriteHeader(http.StatusOK)

	// Subscribe to the broker.
	events, unsub := h.broker.Subscribe(userID)
	defer unsub()

	log.Info().Str("user_id", userID.String()).Msg("sse client connected")

	// Send a connected confirmation.
	fmt.Fprintf(w, "data: {\"type\":\"connected\"}\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			log.Info().Str("user_id", userID.String()).Msg("sse client disconnected")
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			data, err := sse.Marshal(event)
			if err != nil {
				continue
			}
			if _, err := w.Write(data); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
