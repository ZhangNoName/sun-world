## Current Handoff

- Goal: Implement Phase 9 backend structured logging configuration.
- Status: Implemented and verified on branch `monorepo-api-import`; not deployed.
- Repo/path: `/home/lighthouse/blog/sun-world` on server.
- Branch: `monorepo-api-import`

## Files Changed

- `apps/api/src/core/request_context.py` **(new)**
  - `ContextVar`-backed `request_id` storage: `get_request_id()`, `set_request_id()`, `reset_request_id()`, `generate_request_id()`.
- `apps/api/src/core/observability.py` **(new)**
  - `ObservabilityMiddleware` (Starlette `BaseHTTPMiddleware`):
    - Reads `X-Request-ID` / `X-Correlation-ID` or generates UUID4 hex.
    - Rejects oversized or unsafe incoming request IDs.
    - Stores ID in `request_context` contextvar.
    - Resets context after request handling to avoid cross-request leakage.
    - Writes `X-Request-ID` into every response header.
    - Times every request and logs `request_id`, `method`, `path`, `status`, `duration_ms`, `client`, `ua`, `route`.
    - `/healthz`, `/favicon.ico`, `/robots.txt` are logged at `DEBUG` level.
    - Never logs `Authorization`, `Cookie`, query strings, request bodies, or env values.
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
- `docs/architecture/observability-and-analytics.md`
  - Adds Phase 9 structured logging configuration, env flags, JSON/text log contracts, and safety rules.

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

- `bash scripts/check-api.sh` → 73 files compiled OK.
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate` → passed; no generated contract diff.
- `git diff --check` → passed.
- Minimal `configure_logging()` smoke → passed:
  - repeated calls do not duplicate sinks.
  - `BLOG_LOG_FORMAT=json` emits serialized JSON without errors.
- `curl -fsS https://api.sunworld.site/healthz` → `{"status":"ok"}`.
- Final diff secret scan found no secret values in new logging code. Existing `app_instance.py` config-key names such as `password`/`jwt_secret` matched the broad pattern but no secret values were printed or added.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Commit Phase 9 on `monorepo-api-import`.
- Phase 10: OpenTelemetry distributed tracing hooks or backend admin metrics read model.
- Keep production `main` clean and do not deploy this feature branch until the broader refactor is ready.
