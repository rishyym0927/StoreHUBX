#!/bin/bash
# Shared colors + log helpers for scripts/*.sh. Source, don't execute.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CHECK_ERRORS=0

log_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_err()  { echo -e "  ${RED}✗${NC} $1"; CHECK_ERRORS=$((CHECK_ERRORS + 1)); }
log_step() { echo -e "${BLUE}▸ $1${NC}"; }
