#!/usr/bin/env bash
# check-web.sh — 前端构建检查 / Frontend build check
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Running frontend build check..."
cd "$REPO_ROOT"
pnpm build:web
echo "==> Frontend build check passed."
