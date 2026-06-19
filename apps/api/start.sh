#!/usr/bin/env bash
set -euo pipefail

SECRET_ENV_FILE="${BLOG_SECRET_ENV_FILE:-/home/lighthouse/.config/blog_end/auth.env}"
if [ -f "$SECRET_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRET_ENV_FILE"
  set +a
fi

export ENV="${ENV:-local}"
export PYTHONPATH="${PYTHONPATH:-}:$(pwd)/src"

UVICORN_ARGS=(main:app --host 0.0.0.0 --port "${PORT:-8000}" --log-level "${LOG_LEVEL:-info}")
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
