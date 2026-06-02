#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "${SUN_WORLD_API_PYTHON:-}" ]; then
  PYTHON_BIN="$SUN_WORLD_API_PYTHON"
elif [ -x "$REPO_ROOT/apps/api/.venv/bin/python" ]; then
  PYTHON_BIN="$REPO_ROOT/apps/api/.venv/bin/python"
else
  PYTHON_BIN="python3"
fi

cd "$REPO_ROOT"
"$PYTHON_BIN" scripts/export-openapi.py "$@"
