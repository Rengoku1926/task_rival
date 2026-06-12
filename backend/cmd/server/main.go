package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/prateekmahapatra/task_rival/backend/internal/config"
	"github.com/prateekmahapatra/task_rival/backend/internal/database"
	"github.com/prateekmahapatra/task_rival/backend/internal/handler"
	"github.com/prateekmahapatra/task_rival/backend/internal/middleware"
	"github.com/prateekmahapatra/task_rival/backend/internal/repository"
	"github.com/prateekmahapatra/task_rival/backend/internal/service"
	"github.com/prateekmahapatra/task_rival/backend/internal/sse"
)

func main() {
	_ = godotenv.Load()

	// ── Logger ───────────────────────────────────────────────────────────────
	// Pretty-print in development; JSON in production.
	if os.Getenv("ENV") != "production" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	// ── Config ───────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}
	log.Info().Str("env", cfg.Env).Str("port", cfg.Port).Msg("config loaded")

	// ── Migrations ───────────────────────────────────────────────────────────
	// Run against the direct (non-pooled) URL before accepting connections.
	log.Info().Msg("running database migrations")
	if err := database.RunMigrations(cfg.DatabaseURL); err != nil {
		log.Fatal().Err(err).Msg("migrations failed")
	}
	log.Info().Msg("migrations complete")

	// ── Database pool ────────────────────────────────────────────────────────
	ctx := context.Background()
	pool, err := database.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()
	log.Info().Msg("database connected")

	// ── Repositories ─────────────────────────────────────────────────────────
	userRepo       := repository.NewUserRepo(pool)
	taskRepo       := repository.NewTaskRepo(pool)
	tokenRepo      := repository.NewTokenRepo(pool)
	attachmentRepo := repository.NewAttachmentRepo(pool)
	activityRepo   := repository.NewActivityRepo(pool)

	// ── SSE broker ───────────────────────────────────────────────────────────
	broker := sse.NewBroker()

	// ── Services ─────────────────────────────────────────────────────────────
	authSvc   := service.NewAuthService(userRepo, tokenRepo, cfg)
	taskSvc   := service.NewTaskService(taskRepo, activityRepo, broker)
	uploadSvc := service.NewUploadService(cfg.CloudinaryURL)

	// ── Handlers ─────────────────────────────────────────────────────────────
	healthHandler     := handler.NewHealthHandler()
	authHandler       := handler.NewAuthHandler(authSvc)
	taskHandler       := handler.NewTaskHandler(taskSvc)
	attachmentHandler := handler.NewAttachmentHandler(attachmentRepo, taskRepo, uploadSvc, activityRepo)
	activityHandler   := handler.NewActivityHandler(activityRepo)
	sseHandler        := handler.NewSSEHandler(broker, cfg.JWTSecret)

	// ── Router ───────────────────────────────────────────────────────────────
	mux := http.NewServeMux()

	// Middleware shortcuts
	rl   := middleware.RateLimit(100)
	auth := middleware.Auth(cfg)
	adm  := middleware.Admin

	// System
	mux.Handle("GET /health", http.HandlerFunc(healthHandler.Health))

	// Auth — no JWT required
	mux.Handle("POST /auth/signup",  middleware.Chain(http.HandlerFunc(authHandler.Signup),  rl))
	mux.Handle("POST /auth/login",   middleware.Chain(http.HandlerFunc(authHandler.Login),   rl))
	mux.Handle("POST /auth/refresh", middleware.Chain(http.HandlerFunc(authHandler.Refresh), rl))
	mux.Handle("POST /auth/logout",  middleware.Chain(http.HandlerFunc(authHandler.Logout),  rl, auth))

	// Tasks — JWT required
	mux.Handle("GET /tasks",         middleware.Chain(http.HandlerFunc(taskHandler.List),   rl, auth))
	mux.Handle("POST /tasks",        middleware.Chain(http.HandlerFunc(taskHandler.Create), rl, auth))
	mux.Handle("GET /tasks/{id}",    middleware.Chain(http.HandlerFunc(taskHandler.Get),    rl, auth))
	mux.Handle("PATCH /tasks/{id}",  middleware.Chain(http.HandlerFunc(taskHandler.Update), rl, auth))
	mux.Handle("DELETE /tasks/{id}", middleware.Chain(http.HandlerFunc(taskHandler.Delete), rl, auth))

	// Attachments — JWT required
	mux.Handle("GET /tasks/{id}/attachments",            middleware.Chain(http.HandlerFunc(attachmentHandler.List),      rl, auth))
	mux.Handle("POST /tasks/{id}/attachments",           middleware.Chain(http.HandlerFunc(attachmentHandler.Create),    rl, auth))
	mux.Handle("GET /tasks/{id}/attachments/upload-url", middleware.Chain(http.HandlerFunc(attachmentHandler.UploadURL), rl, auth))

	// Activity — JWT required
	mux.Handle("GET /tasks/{id}/activity", middleware.Chain(http.HandlerFunc(activityHandler.List), rl, auth))

	// Admin — JWT + admin role required
	mux.Handle("GET /admin/tasks", middleware.Chain(http.HandlerFunc(taskHandler.AdminList), rl, auth, adm))

	// SSE — token in query param (EventSource can't set headers)
	mux.Handle("GET /events", middleware.Chain(http.HandlerFunc(sseHandler.Stream), rl))

	// ── Global middleware ────────────────────────────────────────────────────
	// Applied outermost — every request goes through these before reaching the mux.
	var httpHandler http.Handler = mux
	httpHandler = middleware.Logger(httpHandler)     // structured request logging
	httpHandler = middleware.CORS(cfg)(httpHandler)  // CORS headers + OPTIONS preflight

	// ── HTTP server ──────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      httpHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 60 * time.Second, // longer for SSE connections
		IdleTimeout:  120 * time.Second,
	}

	// Start in goroutine so we can listen for shutdown signals.
	serverErr := make(chan error, 1)
	go func() {
		log.Info().Str("addr", srv.Addr).Msg("server starting")
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// ── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		log.Fatal().Err(err).Msg("server error")
	case sig := <-quit:
		log.Info().Str("signal", sig.String()).Msg("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	} else {
		log.Info().Msg("server stopped")
	}
}
