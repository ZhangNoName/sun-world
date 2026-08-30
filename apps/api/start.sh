#!/usr/bin/env bash
set -euo pipefail

SECRET_ENV_FILE="${BLOG_SECRET_ENV_FILE:-/home/lighthouse/.config/blog_end/auth.env}"
if [ -f "$SECRET_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRET_ENV_FILE"
  set +a
fi

if [ -n "${BLOG_PORT:-}" ]; then
  export PORT="$BLOG_PORT"
fi

# ENV selects the historical YAML config profile. BLOG_RUNTIME_ENV controls
# cookie/CORS/CSRF security defaults independently, so the production image can
# stay fail-closed while loading the existing local.yml + secret override.
export ENV="${ENV:-local}"
export BLOG_RUNTIME_ENV="${BLOG_RUNTIME_ENV:-production}"
export PYTHONPATH="${PYTHONPATH:-}:$(pwd)/src"

# Uvicorn's access logger includes the raw query string. OAuth providers return
# one-time authorization codes on the callback URL, so rely on the application's
# query-free observability middleware instead of persisting raw request targets.
UVICORN_ARGS=(main:app --host 0.0.0.0 --port "${PORT:-8000}" --log-level "${LOG_LEVEL:-info}" --no-access-log)
if [ "${BLOG_RELOAD:-0}" = "1" ]; then
  UVICORN_ARGS+=(--reload)
fi

if [ -n "${BLOG_PYTHON:-}" ]; then
  PYTHON_BIN="$BLOG_PYTHON"
elif [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
elif command -v poetry >/dev/null 2>&1; then
  exec poetry run uvicorn "${UVICORN_ARGS[@]}"
else
  PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" -m uvicorn "${UVICORN_ARGS[@]}"
