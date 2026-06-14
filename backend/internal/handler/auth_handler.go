package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/prateekmahapatra/task_rival/backend/internal/config"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
	"github.com/prateekmahapatra/task_rival/backend/internal/validator"
	"github.com/rs/zerolog"
)

type AuthHandler struct {
	auth *service.AuthService
	cfg  *config.Config
}

func NewAuthHandler(auth *service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{auth: auth, cfg: cfg}
}

// POST /auth/signup
func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	errs := validator.Errors{}
	validator.Required(errs, "email", req.Email)
	validator.Email(errs, "email", req.Email)
	validator.Required(errs, "password", req.Password)
	validator.MinLen(errs, "password", req.Password, 8)
	validator.Required(errs, "name", req.Name)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	result, err := h.auth.Signup(r.Context(), service.SignupInput{
		Email:    req.Email,
		Password: req.Password,
		Name:     req.Name,
	})
	if err != nil {
		if errors.Is(err, service.ErrEmailTaken) {
			writeError(w, http.StatusConflict, codeConflict, "email already in use", nil)
			return
		}
		log.Error().Err(err).Msg("signup failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	h.setRefreshCookie(w, result.RefreshToken, time.Now().Add(7*24*time.Hour))
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":         result.User,
		"access_token": result.AccessToken,
	})
}

// POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, codeValidation, "invalid JSON body", nil)
		return
	}

	errs := validator.Errors{}
	validator.Required(errs, "email", req.Email)
	validator.Required(errs, "password", req.Password)
	if !errs.OK() {
		writeError(w, http.StatusUnprocessableEntity, codeValidation, "validation failed", errs)
		return
	}

	result, err := h.auth.Login(r.Context(), service.LoginInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "invalid email or password", nil)
			return
		}
		log.Error().Err(err).Msg("login failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	h.setRefreshCookie(w, result.RefreshToken, time.Now().Add(7*24*time.Hour))
	writeJSON(w, http.StatusOK, map[string]any{
		"user":         result.User,
		"access_token": result.AccessToken,
	})
}

// POST /auth/refresh  — reads httpOnly cookie
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "refresh token missing", nil)
		return
	}

	result, err := h.auth.Refresh(r.Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, service.ErrTokenInvalid) {
			h.clearRefreshCookie(w)
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "refresh token invalid or expired", nil)
			return
		}
		log.Error().Err(err).Msg("refresh failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	h.setRefreshCookie(w, result.RefreshToken, time.Now().Add(7*24*time.Hour))
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": result.AccessToken,
	})
}

// POST /auth/logout  — requires Auth middleware
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err == nil {
		_ = h.auth.Logout(r.Context(), cookie.Value)
	}
	h.clearRefreshCookie(w)
	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// GET /auth/me  — requires Auth middleware
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	log := zerolog.Ctx(r.Context())

	user, err := h.auth.Me(r.Context(), middleware.UserIDFrom(r.Context()))
	if err != nil {
		log.Error().Err(err).Msg("me failed")
		writeError(w, http.StatusInternalServerError, codeInternal, "something went wrong", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user": user,
	})
}

// cookie helpers

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    token,
		Expires:  expires,
		HttpOnly: true,
		Secure:   h.cfg.IsProd(),
		SameSite: http.SameSiteLaxMode,
		Path:     "/auth",
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.IsProd(),
		SameSite: http.SameSiteLaxMode,
		Path:     "/auth",
	})
}

// currentUserID is a convenience used across handlers.
func currentUserID(r *http.Request) interface{ String() string } {
	return middleware.UserIDFrom(r.Context())
}