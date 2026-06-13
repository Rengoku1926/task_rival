package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prateekmahapatra/task_rival/backend/internal/config"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/model"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("email already in use")
	ErrTokenInvalid       = errors.New("refresh token is invalid or expired")
)

type AuthService struct {
	users  *repository.UserRepo
	tokens *repository.TokenRepo
	cfg    *config.Config
}

func NewAuthService(
	users *repository.UserRepo,
	tokens *repository.TokenRepo,
	cfg *config.Config,
) *AuthService {
	return &AuthService{users: users, tokens: tokens, cfg: cfg}
}

// SignupInput is the validated input for account creation.
type SignupInput struct {
	Email    string
	Password string
	Name     string
}

// AuthResult is returned by Signup and Login.
type AuthResult struct {
	User         *model.User
	AccessToken  string
	RefreshToken string // raw token — set as httpOnly cookie by the handler
}

func (s *AuthService) Signup(ctx context.Context, in SignupInput) (*AuthResult, error) {
	// Check for duplicate email.
	_, err := s.users.GetByEmail(ctx, in.Email)
	if err == nil {
		return nil, ErrEmailTaken
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.Create(ctx, &model.User{
		Email:    in.Email,
		Password: string(hash),
		Name:     in.Name,
		Role:     model.RoleUser,
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	return s.buildAuthResult(ctx, user)
}

// LoginInput is the validated input for authentication.
type LoginInput struct {
	Email    string
	Password string
}

func (s *AuthService) Login(ctx context.Context, in LoginInput) (*AuthResult, error) {
	user, err := s.users.GetByEmail(ctx, in.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(in.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.buildAuthResult(ctx, user)
}

// Refresh validates a raw refresh token, revokes it, and returns a new token pair.
func (s *AuthService) Refresh(ctx context.Context, rawToken string) (*AuthResult, error) {
	hash := hashToken(rawToken)

	rt, err := s.tokens.GetByHash(ctx, hash)
	if err != nil {
		return nil, ErrTokenInvalid
	}
	if rt.Revoked || time.Now().After(rt.ExpiresAt) {
		return nil, ErrTokenInvalid
	}

	// Revoke old token (rotation — prevents replay attacks).
	if err := s.tokens.Revoke(ctx, hash); err != nil {
		return nil, fmt.Errorf("revoke token: %w", err)
	}

	user, err := s.users.GetByID(ctx, rt.UserID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	return s.buildAuthResult(ctx, user)
}

// Logout revokes the refresh token identified by rawToken.
func (s *AuthService) Logout(ctx context.Context, rawToken string) error {
	hash := hashToken(rawToken)
	err := s.tokens.Revoke(ctx, hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("logout: %w", err)
	}
	return nil
}

// Me returns the current user fetched fresh from the database.
func (s *AuthService) Me(ctx context.Context, userID uuid.UUID) (*model.User, error) {
	return s.users.GetByID(ctx, userID)
}

// --- helpers ----------------------------------------------------------------

func (s *AuthService) buildAuthResult(ctx context.Context, user *model.User) (*AuthResult, error) {
	accessToken, err := s.generateAccessToken(user)
	if err != nil {
		return nil, err
	}

	rawRefresh, err := generateRefreshToken()
	if err != nil {
		return nil, err
	}

	expiresAt := time.Now().Add(s.cfg.RefreshTokenTTL)
	if err := s.tokens.Create(ctx, user.ID, hashToken(rawRefresh), expiresAt); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &AuthResult{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
	}, nil
}

func (s *AuthService) generateAccessToken(user *model.User) (string, error) {
	claims := middleware.Claims{
		UserID: user.ID.String(),
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.cfg.AccessTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func generateRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate refresh token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}