#!/usr/bin/env bash
# check-web.sh — 前端构建检查 / Frontend build check
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "==> Running frontend API contract route usage check..."
node scripts/check-contract-route-usage.mjs
echo "==> Frontend API contract route usage check passed."

echo "==> Running contracts tests..."
pnpm test:contracts
echo "==> Contracts tests passed."

echo "==> Running frontend type check..."
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
echo "==> Frontend type check passed."

echo "==> Running frontend build check..."
pnpm build:web
echo "==> Frontend build check passed."

echo "==> Running frontend performance budget check..."
node scripts/check-web-budgets.mjs
echo "==> Frontend performance budget check passed."
