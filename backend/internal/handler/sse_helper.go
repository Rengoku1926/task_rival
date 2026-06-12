package handler

import (
	"context"

	"github.com/golang-jwt/jwt/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
)

// parseTokenStr re-uses middleware.Claims but lives in the handler package to
// avoid importing middleware from within itself.
func parseTokenStr(tokenStr, secret string) (*middleware.Claims, error) {
	claims := &middleware.Claims{}
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

type contextKey2 string

const (
	ctxUserID contextKey2 = "userID2"
	ctxRole   contextKey2 = "role2"
)

// withUserContext injects user ID and role into a context so middleware.UserIDFrom can read them.
func withUserContext(ctx context.Context, userID, role string) context.Context {
	ctx = context.WithValue(ctx, middleware.ContextKeyUserID, userID)
	ctx = context.WithValue(ctx, middleware.ContextKeyRole, role)
	return ctx
}