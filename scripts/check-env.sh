#!/bin/bash
# Preflight checks for `make dev`/`backend`/`frontend`.
# Usage: check-env.sh [backend|frontend|all]   (default: all)
#
# Prints a clear ✓/⚠/✗ report and exits non-zero with a summary if anything
# required is missing, so a broken run fails before wasting time on docker/air/npm
# instead of surfacing as a cryptic runtime error.

set -uo pipefail

SCOPE="${1:-all}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

BACKEND_ENV="$ROOT_DIR/StoreHUBXBackend/.env"
FRONTEND_ENV="$ROOT_DIR/StoreHUBClient/.env.local"

check_tool() {
  local tool="$1" hint="$2"
  local version_flag="${3:---version}"
  if command -v "$tool" >/dev/null 2>&1; then
    log_ok "$tool found ($($tool $version_flag 2>&1 | head -n1))"
  else
    log_err "$tool not found on PATH. $hint"
  fi
}

check_port_free() {
  local port="$1" owner="$2"
  if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
    log_warn "Port $port is already in use — $owner will fail to start until it's freed (lsof -i :$port to see what's holding it)"
  else
    log_ok "Port $port is free"
  fi
}

# Reads KEY=... from an env file, tail -n1 so a duplicate later line wins (matches shell/dotenv-loader behavior).
env_val() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d '=' -f2-
}

check_backend_var() {
  local var="$1" placeholder="$2" hint="$3"
  local val
  val="$(env_val "$BACKEND_ENV" "$var")"
  if [ -z "$val" ]; then
    log_err "StoreHUBXBackend/.env: $var is not set.${hint:+ $hint}"
  elif [ -n "$placeholder" ] && [ "$val" = "$placeholder" ]; then
    log_err "StoreHUBXBackend/.env: $var is still the example placeholder value.${hint:+ $hint}"
  else
    log_ok "$var is set"
  fi
}

check_backend() {
  log_step "Backend tools"
  check_tool go "Install from https://go.dev/dl/" version
  check_tool docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"

  log_step "Docker daemon"
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
      log_ok "Docker daemon is running"
    else
      log_err "Docker daemon is not reachable. Start Docker Desktop and retry."
    fi
  fi

  log_step "Backend config (StoreHUBXBackend/.env)"
  if [ ! -f "$BACKEND_ENV" ]; then
    log_err "Missing StoreHUBXBackend/.env. Run: cp StoreHUBXBackend/.env.example StoreHUBXBackend/.env, then fill it in."
  else
    log_ok ".env file exists"
    check_backend_var "MONGO_URI" "" ""
    check_backend_var "JWT_SECRET" "your-super-secret-jwt-key" ""
    check_backend_var "TOKEN_ENC_KEY" "your32charsecretkeyforstorehub12" ""
    check_backend_var "GITHUB_CLIENT_ID" "your_github_client_id_here" "Create an OAuth App at https://github.com/settings/developers"
    check_backend_var "GITHUB_CLIENT_SECRET" "your_github_client_secret_here" "Create an OAuth App at https://github.com/settings/developers"
    check_backend_var "GITHUB_REDIRECT_URL" "" ""
  fi

  log_step "Backend ports"
  check_port_free 8080 "the API"
  check_port_free 27017 "MongoDB"
  check_port_free 9000 "MinIO"
  check_port_free 6379 "Redis"
}

check_frontend() {
  log_step "Frontend tools"
  check_tool node "Install from https://nodejs.org/"
  check_tool npm "Comes with Node.js — reinstall Node if missing."

  log_step "Frontend config (StoreHUBClient/.env.local)"
  if [ ! -f "$FRONTEND_ENV" ]; then
    log_err "Missing StoreHUBClient/.env.local. Create it with: echo 'NEXT_PUBLIC_API_BASE=http://localhost:8080' > StoreHUBClient/.env.local"
  elif ! grep -qE '^NEXT_PUBLIC_API_BASE=.+' "$FRONTEND_ENV"; then
    log_err "StoreHUBClient/.env.local: NEXT_PUBLIC_API_BASE is not set."
  else
    log_ok "NEXT_PUBLIC_API_BASE is set"
  fi

  log_step "Frontend ports"
  check_port_free 3000 "the frontend"
}

case "$SCOPE" in
  backend)  check_backend ;;
  frontend) check_frontend ;;
  all)      check_backend; check_frontend ;;
  *)        echo "Unknown scope '$SCOPE' (expected backend|frontend|all)" >&2; exit 2 ;;
esac

echo ""
if [ "$CHECK_ERRORS" -gt 0 ]; then
  echo -e "${RED}✗ $CHECK_ERRORS problem(s) found — fix the above, then re-run.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ All checks passed.${NC}"
