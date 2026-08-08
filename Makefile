.PHONY: dev backend frontend infra stop install check check-backend check-frontend

# One-command local dev: preflight checks + infra + hot-reloading API +
# hot-reloading worker + frontend. Ctrl+C stops everything.
dev: check infra
	@bash scripts/dev.sh all

backend: check-backend infra
	@bash scripts/dev.sh backend

frontend: check-frontend
	@bash scripts/dev.sh frontend

# Start only the Docker infra (Mongo, MinIO, Redis, Prometheus, Grafana). Idempotent.
infra:
	@cd StoreHUBXBackend && docker-compose up -d

stop:
	@cd StoreHUBXBackend && docker-compose down

# Install dependencies and scaffold .env files (does not fill in secrets).
install:
	@cd StoreHUBXBackend && go mod download
	@cd StoreHUBClient && npm install
	@[ -f StoreHUBXBackend/.env ] || (cp StoreHUBXBackend/.env.example StoreHUBXBackend/.env && echo "Created StoreHUBXBackend/.env — fill in GITHUB_CLIENT_ID/SECRET before running 'make dev'.")
	@[ -f StoreHUBClient/.env.local ] || (echo "NEXT_PUBLIC_API_BASE=http://localhost:8080" > StoreHUBClient/.env.local && echo "Created StoreHUBClient/.env.local")

# Verify tools, Docker, env vars, and ports are ready before running anything.
check:
	@bash scripts/check-env.sh all

check-backend:
	@bash scripts/check-env.sh backend

check-frontend:
	@bash scripts/check-env.sh frontend
