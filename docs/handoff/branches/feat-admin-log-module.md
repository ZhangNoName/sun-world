# Admin Log Module Handoff

## Goal

Add a low-coupling, bounded audit-log module with crash/restart records and a
protected admin log viewer.

## Status

Implementation is complete locally on `feat/admin-log-module` and the relevant
frontend build, API protocol checks, contract tests, formatting check, and
whitespace check have passed.

## Important files

- `apps/api/src/core/audit_log.py` — JSONL adapter, retention, lifecycle
  marker, query filtering, and safe field whitelist.
- `apps/api/src/core/observability.py` — centralized mutation/5xx audit event
  emission without controller coupling; route templates prevent parameter data
  from being persisted, and only successful 2xx writes count as mutations.
- `apps/api/app_instance.py` — lifespan startup, graceful stop, and unclean
  restart integration.
- `apps/api/src/routers/admin/admin.py` and `apps/api/src/type/admin_type.py`
  — authenticated `GET /admin/logs` read model.
- `apps/web/src/modules/admin/pages/AdminLogsPage.vue` and
  `apps/web/src/modules/admin/composables/useAdminLogs.ts` — admin UI boundary.
- `.github/workflows/deploy.yml`, `docker-compose.yml`, and
  `deploy/backend/README.md` — durable `/data/blog/audit-logs` mount and env
  wiring for candidate and production containers.
- `scripts/check-audit-log.py`, `scripts/check-audit-log-integration.py`,
  `scripts/check-admin-logs.py`, and `scripts/check-admin-log-page.mjs` —
  regression checks.

## Verification so far

- `corepack pnpm check:web` passed, including type check, production build,
  SSG, API-contract route usage, and performance budgets.
- `corepack pnpm -F @sun-world/contracts test` passed (3 tests).
- Every Python check listed by `scripts/run-api-check.mjs`, including the new
  audit core, middleware integration, and protected read-model checks, passed
  when invoked directly; `python -m py_compile` passed for the changed API
  modules.
- `corepack pnpm format:check` and `git diff --check` passed.
- `corepack pnpm check:github-actions:deploy` and `corepack pnpm check:compose`
  passed; Docker was not installed locally, so Compose performed static rather
  than live Docker CLI validation.
- `corepack pnpm check:api` has a pre-existing unrelated failure in the Sun AI
  CLI skill frontmatter check before it reaches API Python checks; the new API
  checks were run directly.

## Next step

Review and commit the implementation. `corepack pnpm check:api` remains blocked
before Python checks by the unrelated Sun AI CLI skill-frontmatter assertion;
the direct verification above is the API evidence for this branch. Do not
commit generated runtime logs or secrets.
