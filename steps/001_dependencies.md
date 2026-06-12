# Step 001 — Dependencies

Install every external package the backend needs. Everything else (routing, JSON, env, HTTP server) uses the Go stdlib.

## Commands

```bash
cd backend

go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool
go get github.com/golang-migrate/migrate/v4
go get github.com/golang-migrate/migrate/v4/database/postgres
go get github.com/golang-migrate/migrate/v4/source/iofs
go get github.com/golang-jwt/jwt/v5
go get github.com/google/uuid
go get github.com/rs/zerolog
go get golang.org/x/crypto

go mod tidy
```

## Why each package

| Package                                | Used for                                                     |
| -------------------------------------- | ------------------------------------------------------------ |
| `pgx/v5` + `pgxpool`                   | PostgreSQL driver and connection pool                        |
| `golang-migrate/migrate/v4`            | Run `.sql` migration files on startup                        |
| `golang-migrate/.../database/postgres` | Migrate driver (uses lib/pq internally, only for migrations) |
| `golang-migrate/.../source/iofs`       | Load embedded migration files from binary                    |
| `golang-jwt/jwt/v5`                    | Sign and verify JWT access tokens                            |
| `google/uuid`                          | Generate UUIDs (v4)                                          |
| `rs/zerolog`                           | Zero-allocation structured JSON logging                      |
| `golang.org/x/crypto`                  | `bcrypt` for password hashing                                |

## Expected `go.mod`

```
module github.com/prateekmahapatra/task_rival/backend

go 1.22

require (
    github.com/golang-jwt/jwt/v5 v5.2.1
    github.com/golang-migrate/migrate/v4 v4.17.1
    github.com/google/uuid v1.6.0
    github.com/jackc/pgx/v5 v5.6.0
    github.com/rs/zerolog v1.33.0
    golang.org/x/crypto v0.24.0
)
```

> Exact patch versions will differ — `go mod tidy` pins whatever is current. The major versions above are what matter.

## Verify

```bash
cat go.mod
# should list all 6 packages above

go mod verify
# all modules verified
```
