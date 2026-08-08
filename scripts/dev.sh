#!/bin/bash
# Orchestrates local dev processes with prefixed, timestamped logs and a
# single Ctrl+C to tear everything down cleanly.
#
# Usage: dev.sh <target>
#   all       infra + api + worker + web
#   backend   api + worker (assumes infra already running)
#   frontend  web only

set -uo pipefail

TARGET="${1:-all}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib.sh"

AIR="$(command -v air || echo "$(go env GOPATH 2>/dev/null)/bin/air")"

# Prefixes each line of stdin with a colored tag + HH:MM:SS timestamp.
tag() {
  local name="$1" color="$2"
  while IFS= read -r line; do
    printf "${color}[%-6s ${NC}%s${color}]${NC} %s\n" "$name" "$(date '+%H:%M:%S')" "$line"
  done
}

PIDS=()
cleanup() {
  echo ""
  log_step "Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1
  done
  wait >/dev/null 2>&1
  log_ok "All processes stopped."
}
trap cleanup EXIT INT TERM

if [ ! -x "$AIR" ]; then
  log_step "Installing air (Go hot-reload tool)..."
  go install github.com/air-verse/air@latest
  AIR="$(go env GOPATH)/bin/air"
fi

run_api() {
  ( cd "$ROOT_DIR/StoreHUBXBackend" && "$AIR" -c .air.api.toml 2>&1 | tag "api" "$GREEN" ) &
  PIDS+=($!)
}
run_worker() {
  ( cd "$ROOT_DIR/StoreHUBXBackend" && "$AIR" -c .air.worker.toml 2>&1 | tag "worker" "$YELLOW" ) &
  PIDS+=($!)
}
run_web() {
  ( cd "$ROOT_DIR/StoreHUBClient" && npm run dev 2>&1 | tag "web" "$BLUE" ) &
  PIDS+=($!)
}

case "$TARGET" in
  all)
    run_api; run_worker; run_web
    ;;
  backend)
    run_api; run_worker
    ;;
  frontend)
    run_web
    ;;
  *)
    echo "Unknown target '$TARGET' (expected all|backend|frontend)" >&2
    exit 2
    ;;
esac

wait
