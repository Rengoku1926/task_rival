package main

import (
	"context"
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/prateekmahapatra/task_rival/backend/internal/config"
	"github.com/prateekmahapatra/task_rival/backend/internal/database"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	if err := database.RunMigrations(cfg.DatabaseURL); err != nil {
		log.Fatal("migrations:", err)
	}

	ctx := context.Background()
	pool, err := database.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal("database:", err)
	}
	defer pool.Close()

	fmt.Println("database connected")
	fmt.Printf("Config loaded: port=%s env=%s\n", cfg.Port, cfg.Env)
}