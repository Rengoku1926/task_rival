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