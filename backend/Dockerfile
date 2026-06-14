FROM golang:1.25-alpine AS builder

WORKDIR /app

# Download dependencies first (cached unless go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o server \
    ./cmd/server

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
# distroless has no shell — attackers can't exec into the container
FROM gcr.io/distroless/static-debian12

COPY --from=builder /app/server /server

EXPOSE 8080

ENTRYPOINT ["/server"]