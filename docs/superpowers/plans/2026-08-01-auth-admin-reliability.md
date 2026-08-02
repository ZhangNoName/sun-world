# Auth, Admin Authorization, and Management Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make username/email/phone authentication and the management surface reliable, role-protected, migration-safe, and observable when backend dependencies fail.

**Architecture:** Keep the existing FastAPI, PyMySQL, React, and generated-contract boundaries. Add a stable `users.username` identity field with exact-match lookup, centralize admin authorization in a FastAPI dependency, preserve token cookies across refresh/logout with path-compatible cleanup, and make database failures propagate as explicit API errors. The management UI will gate access using the current user and render loading/error/empty/data states with request IDs.

**Tech Stack:** FastAPI, python-jose, PyMySQL, Pydantic, MySQL conservative schema migration, React, Vitest/Testing Library, TypeScript, `corepack pnpm`.

## Global Constraints

- Preserve all existing uncommitted workspace changes; do not reset, commit, push, or deploy.
- Do not delete or rewrite duplicate user records; use the additive username migration and explicit conflict behavior.
- Never log or persist access tokens, refresh tokens, passwords, API keys, or full environment values.
- Production API keys remain server-side; the AI provider catalog stores metadata only.
- Every production behavior change starts with a failing regression test and is verified with the narrowest useful command before broader checks.

---

### Task 1: Authentication identity and JWT exception regression coverage

**Files:**
- Modify: `apps/api/src/type/user_type.py`
- Modify: `apps/api/src/type/auth_type.py`
- Modify: `apps/api/src/controller/user_manage.py`
- Modify: `apps/api/src/controller/auth_manager.py`
- Modify: `apps/api/src/routers/auth/auth.py`
- Modify: `apps/api/src/database/mysql/schema_migration.py`
- Test: `apps/api/tests/test_auth_manager.py`
- Test: `apps/api/tests/test_user_manager.py`

**Interfaces:** `AuthManager.authenticate_user()` accepts one exact identifier and delegates to `UserManager.get_user_by_login_identifier()`. `User.username` is optional for legacy rows but becomes required for new registration. `UserPublic` continues to expose roles/resources without passwords.

- [ ] Write tests for exact username, email, and phone login; duplicate-email lookup must not select an arbitrary row; invalid and expired JWTs must return `None` without raising an `AttributeError`.
- [ ] Run the focused tests and confirm they fail because lookup is email-only, `username` is absent, and exception names are invalid for the installed jose package.
- [ ] Add `username` to the Pydantic user model and conservative schema as nullable-compatible `VARCHAR(128)` with a non-unique index; add exact lookup SQL for username/email/phone using deterministic `ORDER BY id` and active status.
- [ ] Update registration to preserve `name` as nickname and assign a normalized unique username, returning a conflict when it is already used; keep duplicate historical emails non-destructive.
- [ ] Catch `jose.exceptions.ExpiredSignatureError` and `jose.exceptions.JWTError` (with a safe fallback for package variants) in token verification and logout/refresh paths.
- [ ] Run focused tests and then API schema checks.

### Task 2: Token cookie lifecycle and user restoration

**Files:**
- Modify: `apps/api/src/routers/auth/auth.py`
- Modify: `apps/web/src/service/http/index.ts`
- Modify: `apps/web/src/modules/auth/*` (existing auth store/composables discovered during implementation)
- Test: `apps/api/tests/test_auth_router.py`
- Test: `apps/web/src/modules/auth/*.test.ts(x)` (existing test location)

**Interfaces:** Auth responses set `access_token`, `refresh_token`, and `device_id` with one consistent path and environment-derived cookie settings. Logout deletes each cookie using the same path and compatible domain settings. Client bootstrap calls `/api/user/me` and clears stale auth state on 401 before redirecting.

- [ ] Write API tests asserting login sets all three cookies, refresh rotates both token cookies, invalid access tokens do not produce 500, and logout emits path-compatible deletion cookies.
- [ ] Run focused tests and confirm the current implementation fails for missing refresh cookie and inconsistent login/register cookie behavior.
- [ ] Centralize cookie options, set refresh token cookies on login/register/refresh, and delete old path variants (`/`, `/api`, and empty legacy path where applicable) without exposing token values.
- [ ] Add client-side 401 recovery/clear behavior so stale duplicate cookies cannot leave the UI claiming an authenticated session; preserve request IDs in error objects.
- [ ] Run focused API and web auth tests.

### Task 3: Server and client management authorization

**Files:**
- Modify: `apps/api/src/routers/auth/auth.py`
- Modify: `apps/api/src/routers/admin/admin.py`
- Modify: `apps/api/src/routers/blog/blog.py` or the actual blog mutation router discovered in the repository
- Modify: `apps/web/src/pages/manage/index.tsx`
- Modify: `apps/web/src/modules/admin/index.ts`
- Modify: `apps/web/src/modules/blog/pages/ArticleEditorPage.tsx`
- Test: `apps/api/tests/test_admin_authorization.py`
- Test: `apps/web/src/pages/manage/manage-guard.test.tsx`

**Interfaces:** `require_admin` is a reusable FastAPI dependency that accepts the authenticated user and returns it only when a role has `code == "admin"`; otherwise it raises HTTP 403 with a stable error code. Every `/admin/*` route and sensitive blog write route uses it. The `/manage` route renders an auth/forbidden state or redirects before loading management data.

- [ ] Write tests proving admin users can access metrics, logs, AI catalog, and blog mutations while normal users receive 403 and unauthenticated users receive 401.
- [ ] Run the focused tests and confirm existing routes currently accept any authenticated user.
- [ ] Implement `require_admin` once, apply it to all admin routes and blog create/update/delete routes, and keep route-level error envelopes consistent.
- [ ] Add a client guard using `/api/user/me`, with explicit loading, unauthorized, forbidden, and retry states; prevent unauthenticated blog management/editor links from loading privileged data.
- [ ] Run API authorization tests and the focused web guard test.

### Task 4: MySQL pool, migration, and error propagation

**Files:**
- Modify: `apps/api/src/database/mysql/mysql_manage.py`
- Modify: `apps/api/src/database/mysql/schema_migration.py`
- Modify: `apps/api/src/modules/ai/repositories.py`
- Modify: `apps/api/src/modules/ai/service.py`
- Modify: `apps/api/src/routers/admin/admin.py`
- Test: `apps/api/tests/test_mysql_manager.py`
- Test: `apps/api/tests/test_schema_migration.py`
- Test: `apps/api/tests/test_ai_repositories.py`
- Test: `apps/api/tests/test_admin_ai_providers.py`

**Interfaces:** `MySQLManager` uses a bounded pool with per-operation connection checkout, `ping(reconnect=True)`, local cursor context, commit/rollback, and guaranteed return. Readiness uses an independent checkout. Repository database exceptions remain exceptions and are mapped to a visible 503/500 API response; an absent `ai_provider_catalog` table must not become `[]`.

- [ ] Write tests for pool checkout/return under concurrent operations, stale connection replacement, readiness isolation, and repository propagation of a simulated 1146 error.
- [ ] Run focused tests and confirm shared cursor/connection and swallowed exceptions fail those tests.
- [ ] Implement the smallest pool wrapper compatible with current manager callers; preserve method signatures and existing transaction semantics.
- [ ] Remove broad database exception-to-empty-list behavior from AI catalog reads and map known dependency failures to an API error with request ID.
- [ ] Keep schema migration additive and idempotent for `users.username` and all AI tables; add preflight SQL and report the exact apply command if the local process cannot reach production MySQL.
- [ ] Run API migration, pool, AI, and authorization tests.

### Task 5: Management UI reliability and layout

**Files:**
- Modify: `apps/web/src/pages/manage/index.tsx`
- Modify: `apps/web/src/pages/manage/manage.css`
- Modify: `apps/web/src/modules/admin/pages/AdminChartsPage.tsx`
- Modify: `apps/web/src/modules/admin/pages/AdminMetricsPage.tsx`
- Modify: `apps/web/src/modules/admin/pages/AdminLogsPage.tsx`
- Modify: `apps/web/src/pages/manage/aigc/index.tsx`
- Modify: `apps/web/src/pages/manage/blog/index.tsx`
- Test: `apps/web/src/pages/manage/*.test.tsx`

**Interfaces:** Each tab exposes loading, error (including request ID), empty, and data states; failed requests show an enabled retry action. AIGC forms use responsive grid columns that fit at 1280px and narrow widths. Metrics/history/telemetry/alerts failures never render a blank panel.

- [ ] Write component tests for each tab’s error/retry/empty state, AI missing-table error, admin forbidden state, and 1280px/narrow layout class contract.
- [ ] Run the tests and confirm the current tabs have blank/errorless failure states and the AIGC form overflows at 1280px.
- [ ] Add shared admin request error normalization with request ID extraction, retry controls, and bounded responsive layouts.
- [ ] Update each tab and provider catalog view to use the shared state contract without direct shadcn primitive imports.
- [ ] Run focused UI tests, web typecheck, and production build.

### Task 6: Verification and handoff

**Files:**
- Modify: `docs/agent-handoff.md`
- Modify: `docs/current-state.md` only if stable runtime/migration instructions change

- [ ] Run focused API tests, `corepack pnpm check:api`, focused web tests, `corepack pnpm -C apps/web run typecheck`, `corepack pnpm -C apps/web run build`, `corepack pnpm format:check`, and `git diff --check`.
- [ ] Run a local HTTP smoke check for username/email/phone login, `/api/user/me`, admin 200/403, refresh, logout, and each management tab endpoint without recording tokens.
- [ ] Give the main task exact safe migration preflight/apply commands and required API/frontend restart commands.
- [ ] Record files, evidence, remaining environmental blockers, and browser QA gaps in the handoff; do not commit or deploy.
