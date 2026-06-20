#!/usr/bin/env bash
# Validate Docker Compose configuration without starting or replacing services.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: docker-compose.yml not found at $COMPOSE_FILE"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker CLI is not installed or not on PATH"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin is not available"
  exit 1
fi

echo "==> Validating Docker Compose syntax..."
docker compose -f "$COMPOSE_FILE" config --quiet

services="$(docker compose -f "$COMPOSE_FILE" config --services)"
profiles="$(docker compose -f "$COMPOSE_FILE" config --profiles || true)"

if ! printf '%s\n' "$services" | grep -qx 'frontend'; then
  echo "ERROR: frontend service is missing"
  exit 1
fi

if ! printf '%s\n' "$services" | grep -qx 'api'; then
  echo "ERROR: api service is missing"
  exit 1
fi

if ! printf '%s\n' "$profiles" | grep -qx 'api'; then
  echo "ERROR: api profile is missing"
  exit 1
fi

rendered="$(docker compose -f "$COMPOSE_FILE" config)"

if ! printf '%s\n' "$rendered" | grep -Eq '127\.0\.0\.1:(\$\{BLOG_API_HOST_PORT:-18000\}|18000):8000'; then
  echo "ERROR: api service must bind to 127.0.0.1:${BLOG_API_HOST_PORT:-18000}:8000"
  exit 1
fi

if ! printf '%s\n' "$rendered" | grep -q 'target: /home/lighthouse/.config/blog_end'; then
  echo "ERROR: api service must mount the production secret directory read-only"
  exit 1
fi

if ! printf '%s\n' "$rendered" | grep -q 'target: /app/src/conf'; then
  echo "ERROR: api service must mount the legacy production config directory read-only"
  exit 1
fi

if ! printf '%s\n' "$rendered" | grep -q '8081:80'; then
  echo "ERROR: frontend service must publish 8081:80"
  exit 1
fi

cat <<'MSG'
==> Compose config is valid.
No deployment command was run. This script does not call up, run, restart, rm, or systemctl.
MSG
