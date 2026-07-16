# Admin Log Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, privacy-safe, restart-aware backend audit logs and an authenticated admin log viewer.

**Architecture:** A file-backed adapter behind `AuditLogService` owns JSONL persistence, rotation and query filtering. Middleware and lifespan emit typed events; the admin router exposes the read model and the web admin module renders it via generated contracts.

**Tech Stack:** FastAPI, Pydantic v2, Loguru, Vue 3, TypeScript, generated OpenAPI contracts.

## Global Constraints

- Never log request bodies, query strings, cookies, authorization headers, IP addresses, user agents, exception messages, secrets, or full user data.
- Default retained audit data must stay at or below 3 MiB (1 MiB active + two rotated files).
- Log-store failure must not fail a request or lifecycle operation.
- All admin log reads use the existing `get_current_user` authorization dependency.

---

### Task 1: Build the bounded audit-log core

**Files:**
- Create: `apps/api/src/core/audit_log.py`
- Test: `scripts/check-audit-log.py`

**Interfaces:**
- Produces `AuditLogService.record(event_type, severity, **fields)`, `start()`, `stop()`, and `list_events(limit, severity, event_type)`.
- Produces `AuditLogSnapshot` dictionaries with `events`, `retained_file_count`, and `max_file_bytes`.

- [ ] Write tests for sanitization, rotation, newest-first filtering, append isolation, clean shutdown, and unclean restart.
- [ ] Run `python scripts/check-audit-log.py` and confirm expected failures because `audit_log` is absent.
- [ ] Implement the minimal independent service and JSONL adapter to satisfy the tests.
- [ ] Re-run `python scripts/check-audit-log.py` and confirm all checks pass.

### Task 2: Emit lifecycle and request audit events

**Files:**
- Modify: `apps/api/app_instance.py`
- Modify: `apps/api/src/core/observability.py`
- Test: `scripts/check-audit-log.py`

**Interfaces:**
- Consumes `AuditLogService.start`, `.stop`, and `.record`.
- Produces lifecycle records and centralized request audit records without controller changes.

- [ ] Add a failing assertion for lifecycle and mutation/5xx event production.
- [ ] Run the audit check and confirm the new assertion fails.
- [ ] Wire lifespan and middleware to the shared service with non-blocking error handling.
- [ ] Re-run the audit check and confirm it passes.

### Task 3: Publish the protected log read model

**Files:**
- Modify: `apps/api/src/type/admin_type.py`
- Modify: `apps/api/src/routers/admin/admin.py`
- Modify: `scripts/run-api-check.mjs`
- Create: `scripts/check-admin-logs.py`

**Interfaces:**
- Produces `GET /admin/logs?limit=&severity=&event_type=` and Pydantic `AdminLogSnapshot`.
- Consumes `AuditLogService.list_events` and existing `get_current_user`.

- [ ] Write a failing static/protocol test for route authentication, bounded query values, and response model.
- [ ] Run `python scripts/check-admin-logs.py` and confirm it fails before the route exists.
- [ ] Add only the typed read endpoint and include its check in `check:api`.
- [ ] Re-run the admin log and audit checks.

### Task 4: Add the admin log page

**Files:**
- Modify: `apps/web/src/modules/admin/api.ts`
- Modify: `apps/web/src/modules/admin/types.ts`
- Create: `apps/web/src/modules/admin/composables/useAdminLogs.ts`
- Create: `apps/web/src/modules/admin/pages/AdminLogsPage.vue`
- Modify: `apps/web/src/modules/admin/index.ts`
- Modify: `apps/web/src/pages/manage/index.vue`
- Test: `scripts/check-admin-log-page.mjs`

**Interfaces:**
- Consumes generated `/admin/logs` contract using `apiGet`.
- Produces `/manage/logs` with refresh and local severity/event-type filters.

- [ ] Write a failing static boundary check for typed `apiGet`, route registration, filtering, and empty/error states.
- [ ] Run `node scripts/check-admin-log-page.mjs` and confirm it fails before files exist.
- [ ] Implement the focused composable and responsive page.
- [ ] Run the page check and the web type checker.

### Task 5: Regenerate contracts and verify integration

**Files:**
- Modify: `packages/contracts/openapi.json`
- Modify: `packages/contracts/src/generated-api-types.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

- [ ] Generate OpenAPI and generated API types using the repository scripts.
- [ ] Run audit, admin-log, API contract, frontend type, format, and build checks.
- [ ] Record exact verification evidence and known unrelated baseline failure in the handoff.
