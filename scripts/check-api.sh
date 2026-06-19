#!/usr/bin/env bash
# Backend migration/syntax check. Does not import the app, connect to databases,
# start uvicorn, or print secret values.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$SCRIPT_DIR/check-api-migration.py"
