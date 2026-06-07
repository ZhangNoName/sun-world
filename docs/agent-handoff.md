## Current Handoff

- Goal: Implement Phase 10 authenticated admin request metrics snapshot.
- Status: In progress on branch `monorepo-api-import`; not deployed.
- Repo/path: `/home/lighthouse/blog/sun-world` on server.
- Branch: `monorepo-api-import`

## Files Changed

- `apps/api/src/core/metrics.py` **(new)**
  - Process-local request metrics collector.
  - Tracks total requests, 5xx requests, status distribution, and per-route latency/counts.
  - Bounded route cardinality; excess routes aggregate into `__other__`.
- `apps/api/src/type/admin_type.py` **(new)**
  - Pydantic response models for `RequestMetricsSnapshot`, `RouteMetric`, and `StatusMetric`.
- `apps/api/src/routers/admin/admin.py` **(new)**
  - Authenticated `GET /admin/metrics` endpoint using existing `get_current_user`.
- `apps/api/src/routers/admin/__init__.py` **(new)**
  - Exports `admin_router`.
- `scripts/export-openapi.py`
  - Includes `admin_router` in the schema-only OpenAPI export app.
- `apps/api/src/core/request_context.py` **(new)**
  - `ContextVar`-backed `request_id` storage: `get_request_id()`, `set_request_id()`, `reset_request_id()`, `generate_request_id()`.
- `apps/api/src/core/observability.py`
  - `ObservabilityMiddleware` (Starlette `BaseHTTPMiddleware`):
    - Reads `X-Request-ID` / `X-Correlation-ID` or generates UUID4 hex.
    - Rejects oversized or unsafe incoming request IDs.
    - Stores ID in `request_context` contextvar.
    - Resets context after request handling to avoid cross-request leakage.
    - Writes `X-Request-ID` into every response header.
    - Times every request and logs `request_id`, `method`, `path`, `status`, `duration_ms`, `client`, `ua`, `route`.
    - `/healthz`, `/favicon.ico`, `/robots.txt` are logged at `DEBUG` level.
    - Never logs `Authorization`, `Cookie`, query strings, request bodies, or env values.
    - Records non-noisy request metrics after each request.
- `apps/api/main.py`
  - Added `loguru` and `request_context` imports.
  - `http_exception_handler`: logs `request_id`, method, path, status, detail at `WARNING`.
  - `validation_exception_handler`: logs count at `WARNING`, individual field errors at `DEBUG`.
  - `general_exception_handler`: logs `request_id`, method, path, exception type, and bounded detail with traceback via `logger.exception()`.
  - Response envelope structure and status codes are unchanged.
- `apps/api/app_instance.py`
  - Registers `ObservabilityMiddleware` after CORS so Starlette builds it as the outer project middleware.
- `apps/api/src/core/logging.py` **(new)**
  - Adds idempotent `configure_logging()` for loguru.
  - Defaults to human-readable stderr logs.
  - Supports `BLOG_LOG_FORMAT=json` for serialized JSON logs.
  - Supports safe `BLOG_LOG_LEVEL` normalization.
  - Keeps `BLOG_LOG_BACKTRACE` and `BLOG_LOG_DIAGNOSE` disabled by default.
- `apps/api/app_instance.py`
  - Calls `configure_logging()` during module import before `Application` is created.
- `apps/web/src/modules/admin/api.ts` **(new)**
  - Exposes `fetchAdminMetrics()` via the existing HTTP wrapper.
- `apps/web/src/modules/admin/types.ts` **(new)**
  - Derives admin metric types from generated OpenAPI contracts.
- `apps/web/src/modules/admin/index.ts`
  - Exports typed admin API/types from the module boundary.
- `docs/architecture/observability-and-analytics.md`
  - Adds Phase 10 admin request metrics snapshot, endpoint contract, scope, and limitations.

## Commands Run

- `git status --short --branch`
- `bash scripts/check-api.sh`
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate`
- `git diff --check`
- `PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... minimal ObservabilityMiddleware TestClient smoke ...`
- `curl -fsS https://api.sunworld.site/healthz`
- `grep -RInE "sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE)|password\\s*=|token\\s*=|secret\\s*=" ...`
- `BLOG_LOG_FORMAT=json BLOG_LOG_LEVEL=DEBUG PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... configure_logging smoke ...`

## Verification

- `bash scripts/check-api.sh` → 77 files compiled OK.
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate` → passed; generated `GET /admin/metrics` contracts.
- `grep -R "get_admin_metrics_admin_metrics_get" packages/contracts/src/generated-api-types.ts packages/contracts/openapi.json` → operation exists in both generated outputs.
- `pnpm check:web` → frontend build passed. Existing Element Plus Sass deprecation warnings remain.
- `pnpm exec tsc --noEmit --skipLibCheck --moduleResolution Bundler --module ESNext --target ES2020 apps/web/src/modules/admin/types.ts` → admin contract type reference passed.
- `PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... ObservabilityMiddleware + metrics TestClient smoke ...` → passed:
  - request ID header is propagated.
  - non-noisy routes are counted.
  - 5xx responses increment `error_requests`.
  - `/healthz` is skipped from metrics.
- `git diff --check` → passed.
- Sensitive scan found no secret values. The only match was the benign code variable name `context_token` in `observability.py`.
- `pnpm -F @sun-world/blog exec vue-tsc --noEmit` was attempted but blocked by the repository's existing `vue-tsc@1.8.27` / TypeScript compatibility issue: `Search string not found: "/supportedTSExtensions = .*(?=;)/"`.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Run API checks, regenerate contracts, run frontend type/build checks, smoke-test metrics collector, and commit Phase 10 on `monorepo-api-import`.
- Keep production `main` clean and do not deploy this feature branch until the broader refactor is ready.
