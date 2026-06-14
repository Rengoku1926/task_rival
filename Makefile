.PHONY: up up-backend up-frontend down logs migrate test test-backend test-frontend rebuild

# Start full stack with one command
up:
	docker compose up --build

# Start only backend + DB (run frontend with `npm run dev` separately)
up-backend:
	docker compose -f docker-compose.backend.yml up --build

# Start only frontend (assumes backend running)
up-frontend:
	cd frontend && npm install && npm run dev

# Stop all containers
down:
	docker compose down

# Tail logs
logs:
	docker compose logs -f

# Run DB migrations manually
migrate:
	docker compose exec backend ./server migrate

# Run all tests
test:
	cd backend && go test ./...
	cd frontend && npm run test

# Run backend tests only
test-backend:
	cd backend && go test ./... -v -race

# Run frontend tests only
test-frontend:
	cd frontend && npm run test

# Rebuild without cache
rebuild:
	docker compose up --build --force-recreate
