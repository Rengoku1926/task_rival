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