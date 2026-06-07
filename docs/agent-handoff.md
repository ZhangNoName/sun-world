## Current Handoff

- Goal: Implement Phase 8 backend request observability (request ID middleware, structured request/error logging).
- Status: Implemented and verified on branch `monorepo-api-import`; Codex review tightened request-id safety/context reset; not deployed.
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
- `docs/architecture/observability-and-analytics.md`
  - Replaced Backend "Current State" / "Phase 2 Plan" with "Phase 8 — Request Observability (Implemented)".
  - Documented behaviour, security rules, log contract, and future phases (9–11).

## Commands Run

- `git status --short --branch`
- `bash scripts/check-api.sh`
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate`
- `git diff --check`
- `PYTHONPATH=apps/api /home/lighthouse/blog/blog_end/.venv/bin/python - <<'PY' ... minimal ObservabilityMiddleware TestClient smoke ...`
- `curl -fsS https://api.sunworld.site/healthz`
- `grep -RInE "sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE)|password\\s*=|token\\s*=|secret\\s*=" ...`

## Verification

- `bash scripts/check-api.sh` → 72 files compiled OK.
- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate` → passed; no generated contract diff.
- `git diff --check` → passed.
- Minimal `ObservabilityMiddleware` TestClient smoke → passed:
  - valid `X-Request-ID` is propagated to response header and context.
  - unsafe request ID is replaced with a generated UUID4 hex.
- `curl -fsS https://api.sunworld.site/healthz` → `{"status":"ok"}`.
- Final diff secret scan found no secret values; only `context_token` variable name matched the generic token pattern.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Commit on `monorepo-api-import` when ready.
- Phase 9: structured JSON logging with loguru serialisation.
- Phase 10: OpenTelemetry distributed tracing hooks.
- Keep production `main` clean and do not deploy this feature branch until the broader refactor is ready.
