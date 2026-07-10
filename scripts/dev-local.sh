#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env
  set +a
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://admin:adminpassword@localhost:5433/gstock_db?schema=public}"
export JWT_SECRET="${JWT_SECRET:-changez-moi-en-production-avec-openssl-rand-hex-32}"
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-5001}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
export BACKEND_URL="${BACKEND_URL:-http://localhost:${PORT}}"
export NEXT_PUBLIC_APP_NAME="${APP_NAME:-Stock Manager}"

echo "==> Starting local PostgreSQL container"
docker compose up -d postgres

echo "==> Local development URLs"
echo "    Backend : http://localhost:${PORT}"
echo "    Frontend: http://localhost:3000"
echo "    Database: ${DATABASE_URL}"
echo ""
echo "Install dependencies first if needed:"
echo "    npm run install:all"
echo ""
echo "Run migrations if the schema changed:"
echo "    npm run db:migrate"
echo ""

cleanup() {
  local exit_code=$?

  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

(
  cd backend
  PORT="${PORT}" \
  DATABASE_URL="${DATABASE_URL}" \
  JWT_SECRET="${JWT_SECRET}" \
  NODE_ENV="${NODE_ENV}" \
  FRONTEND_URL="${FRONTEND_URL}" \
  npm run dev
) &
BACKEND_PID=$!

(
  cd frontend
  PORT=3000 \
  BACKEND_URL="${BACKEND_URL}" \
  NEXT_PUBLIC_APP_NAME="${NEXT_PUBLIC_APP_NAME}" \
  npm run dev
) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
