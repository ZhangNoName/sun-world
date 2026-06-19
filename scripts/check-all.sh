#!/usr/bin/env bash
# check-all.sh — 完整检查 / Full verification
# 运行前端构建、后端语法检查、公共健康检查。
# Runs frontend build, backend syntax check, and public health checks.
# 不部署，不修改生产，不打印密钥。
# Does not deploy, does not modify production, does not print secrets.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASSED=0
FAILED=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

run_check() {
    local label="$1"
    shift
    echo ""
    echo "====> $label"
    if "$@" 2>&1; then
        green "  PASS: $label"
        PASSED=$((PASSED + 1))
    else
        red "  FAIL: $label"
        FAILED=$((FAILED + 1))
    fi
}

cd "$REPO_ROOT"

# 1. Git diff check
run_check "git diff --check" git diff --check

# 2. Frontend build
run_check "frontend build (pnpm build:web)" pnpm build:web

# 3. Backend syntax check
run_check "backend syntax" bash "$SCRIPT_DIR/check-api.sh"

# 4. Public health — backend
run_check "public health (api.sunworld.site)" curl -fsS https://api.sunworld.site/healthz

# 5. Public health — frontend
run_check "public health (sunworld.site)" curl -I https://sunworld.site

echo ""
echo "========================================"
echo "  Results: $PASSED passed, $FAILED failed"
echo "========================================"

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
green "All checks passed."
