#!/usr/bin/env bash
# check-api.sh — 后端语法检查 / Backend syntax check
# 仅运行 Python 编译检查，不连接生产数据库或打印密钥。
# Only runs Python compile checks; does not connect to production databases or print secrets.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"

echo "==> Running backend syntax check..."

if [ ! -d "$API_DIR/src" ]; then
    echo "ERROR: apps/api/src not found"
    exit 1
fi

# Python 编译检查，不导入任何模块（避免连接数据库或读取真实配置）
# Python compile check — do not import modules to avoid DB connections or real config reads
python3 -m py_compile "$API_DIR/main.py" || {
    echo "ERROR: main.py failed to compile"
    exit 1
}

# 检查所有 Python 源文件的语法
# Check syntax of all Python source files
find "$API_DIR/src" -name '*.py' -print0 | while IFS= read -r -d '' f; do
    python3 -m py_compile "$f" || {
        echo "ERROR: $f failed to compile"
        exit 1
    }
done

echo "==> Backend syntax check passed — $(find "$API_DIR/src" -name '*.py' | wc -l) files compiled OK."
