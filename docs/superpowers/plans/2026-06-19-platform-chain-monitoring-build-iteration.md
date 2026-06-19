# Platform Chain Monitoring Build Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend-backend business chain observable, documented, and easier to verify while keeping build and package boundaries lean.

**Architecture:** Keep contracts in `packages/contracts`, runtime observability in `apps/api/src/core`, HTTP delivery in `apps/web/src/shared/telemetry`, and admin visualization in `apps/web/src/modules/admin`. The first monitoring iteration is in-memory by design; persistent storage is a later adapter behind the same protocol.

**Tech Stack:** Vue 3, Vite, FastAPI, Pydantic, OpenAPI, Vitest, Docker Compose.

---

## File Structure

- Create: `docs/architecture/platform-iteration-roadmap.md` - commit/push policy, chain audit, monitoring roadmap, build optimization roadmap.
- Create: `scripts/check-rum-metrics.py` - backend RUM collector protocol check.
- Create: `apps/api/src/core/rum_metrics.py` - dependency-free RUM event aggregation.
- Create: `apps/api/src/type/telemetry_type.py` - Pydantic request/response models.
- Create: `apps/api/src/routers/telemetry/telemetry.py` - public telemetry ingestion endpoint.
- Modify: `apps/api/src/routers/admin/admin.py` - authenticated admin RUM snapshot endpoint.
- Modify: `packages/contracts/src/routes.ts` - stable route constants for telemetry endpoints.
- Modify: `apps/web/src/modules/admin/*` - display RUM metrics in the existing admin metrics page.
- Modify: `Dockerfile` and `docker-compose.yml` - frontend build args for public API and telemetry endpoint.
- Modify: `scripts/run-api-check.mjs` - include RUM protocol check in `pnpm check:api`.

## Task 1: Commit And Chain Policy

- [x] **Step 1: Document the commit and push rule**

Write `docs/architecture/platform-iteration-roadmap.md` with this decision:

```text
Do not commit and push after every tiny edit. Commit after coherent verified
checkpoints. Push after checks pass, or earlier only for backup or handoff.
```

- [x] **Step 2: Document the current frontend-backend path**

Record the chain:

```text
Vue modules -> shared/api -> service/http -> @sun-world/contracts ->
FastAPI routers -> { code, data, msg } envelope -> frontend consumers.
```

## Task 2: RUM Protocol

- [x] **Step 1: Write the failing protocol check**

Create `scripts/check-rum-metrics.py` and assert:

```python
assert snapshot["accepted_events"] == 2
assert snapshot["rejected_events"] == 1
assert snapshot["web_vitals"]["LCP"]["avg_value"] == 2450.4
assert "private=value" not in snapshot["recent_events"][1]["path"]
```

- [x] **Step 2: Run the red check**

Run:

```powershell
python scripts\check-rum-metrics.py
```

Expected initial failure:

```text
ModuleNotFoundError: No module named 'src.core.rum_metrics'
```

- [x] **Step 3: Implement the collector and endpoints**

Add:

```text
apps/api/src/core/rum_metrics.py
apps/api/src/type/telemetry_type.py
apps/api/src/routers/telemetry/telemetry.py
GET /admin/telemetry
POST /telemetry/events
```

- [x] **Step 4: Run the green check**

Run:

```powershell
python scripts\check-rum-metrics.py
```

Expected result:

```text
RUM metrics protocol check passed
```

## Task 3: Contracts And Admin UI

- [x] **Step 1: Regenerate OpenAPI and TS types**

Run:

```powershell
apps\api\.venv\Scripts\python.exe scripts\export-openapi.py
pnpm -F @sun-world/contracts exec openapi-typescript openapi.json -o src/generated-api-types.ts
```

- [x] **Step 2: Add route constants**

Add these constants:

```ts
API_ROUTES.telemetry.events === '/telemetry/events'
API_ROUTES.admin.telemetry === '/admin/telemetry'
```

- [x] **Step 3: Add admin RUM panels**

Extend `useAdminMetrics()` to load:

```ts
Promise.all([fetchAdminMetrics(), fetchAdminTelemetry()])
```

Display:

```text
RUM events, rejected events, Web Vitals, browser errors, recent RUM events.
```

## Task 4: Build And Runtime

- [x] **Step 1: Add frontend Docker build args**

Configure:

```dockerfile
ARG VITE_BASE_URL=
ARG VITE_TELEMETRY_ENDPOINT=
```

Configure compose defaults:

```yaml
VITE_BASE_URL: https://api.sunworld.site
VITE_TELEMETRY_ENDPOINT: https://api.sunworld.site/telemetry/events
```

- [x] **Step 2: Verify**

Run:

```powershell
pnpm check:api
pnpm -F @sun-world/contracts test
pnpm -C apps/web exec vue-tsc --noEmit
pnpm -C apps/web build
pnpm check:web:budgets
pnpm check:compose
```

Expected result: exit code `0` for each command. Existing Vite CJS and Element
Plus Sass deprecation warnings may remain until dependency upgrades.

## Task 5: Next Iteration

- [ ] **Step 1: Persist RUM metrics**

Add a storage adapter behind `record_rum_event()`:

```python
class RumMetricsStore:
    def record(self, event: dict[str, object]) -> bool: ...
    def snapshot(self) -> dict[str, object]: ...
```

Prefer Redis for short retention or Postgres for durable analytics.

Partial progress: P1.43 added a generic metrics snapshot store protocol and
optional single-node JSON snapshot adapter behind request/RUM snapshot
generation. Event-level RUM storage behind `record_rum_event()` remains open.

- [x] **Step 2: Add percentile metrics**

Extend the snapshot with:

```text
p50_duration_ms
p95_duration_ms
p99_duration_ms
```

Request metrics now keep bounded duration samples and expose global plus
per-route `p50_duration_ms`, `p95_duration_ms`, and `p99_duration_ms`. RUM Web
Vitals now keep bounded value samples and expose `p50_value`, `p95_value`, and
`p99_value`. The admin metrics page shows request p95/p99 in the route list and
Web Vitals p95/p99 in the RUM panel. `pnpm check:api` runs both
`scripts/check-request-metrics.py` and `scripts/check-rum-metrics.py`.

- [x] **Step 3: Optimize Docker cache layout**

Split Dockerfile dependency install from source copy:

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/editor/package.json packages/editor/package.json
COPY packages/icons/package.json packages/icons/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile
COPY . .
```

Guarded by `scripts/check-docker-build-context.mjs`, which is available through
`pnpm check:dockerfile` and runs as part of `pnpm check:compose`.

- [x] **Step 4: Make root Web checks and builds cross-platform**

`pnpm check:web` now runs through `scripts/check-web.mjs` instead of requiring
`bash`. Root `build:web`, `build:editor`, and `build:icons` now run through
`scripts/run-workspace-script.mjs`, which injects `NODE_OPTIONS` without
POSIX-only environment variable syntax.

- [x] **Step 5: Guard module API routes through contracts**

`scripts/check-contract-route-usage.mjs` rejects direct backend route strings
inside `apps/web/src/modules/**/api.ts`. Blog, account, and admin module API
files now use `API_ROUTES` from `@sun-world/contracts`.

- [x] **Step 6: Remove retired legacy API entrypoints**

`apps/web/src/service/request.ts` and `apps/web/src/hooks/auth/auth.ts` were
unused by production code and are now deleted. `scripts/check-legacy-api-entrypoints.mjs`
guards against reintroducing those files, importing those paths, or using the
old `axios.post('/api/refresh')` shortcut.

- [x] **Step 7: Remove account service facades**

`apps/web/src/service/auth.req.ts` and `apps/web/src/service/user.req.ts` were
compatibility facades over `modules/account`. `apps/web/src/store/auth.ts` now
imports directly from `@/modules/account`, and the legacy API entrypoint check
guards the retired facade paths.

- [x] **Step 8: Remove blog management request facade**

`apps/web/src/service/manageRequest.ts` accepted arbitrary backend URL strings
and was only used by the blog management table. `SunTable` now accepts a typed
`fetchPage` function, while `useBlogManagement()` provides `fetchBlogTablePage`
through the module-owned `fetchBlogPage()` API boundary.

- [x] **Step 9: Move AI chat to module API and backend contracts**

`apps/web/src/modules/ai/api.ts` now owns AI chat and stream calls through
`API_ROUTES.ai.*`. The old browser-side `apps/web/src/aigc` LangChain/OpenAI
client is deleted, `AigcPage` sends through the backend `/ai/chat` route, and
`pnpm check:web:legacy-api` guards against direct `@/service/http` imports and
the retired `src/aigc` files. The backend `/ai/chat` route now has an
`ApiResponse[str]` response model, and image-model imports are lazy inside
their endpoints.

- [x] **Step 10: Split route-only heavy dependencies out of global vendor**

Vite manual chunks now keep Artplayer/HLS dependencies in `video-player` and
JSZip in `tile-export`. `saveTilesAsZip()` dynamically imports JSZip when the
export action runs instead of loading it at module import time. Added
`scripts/check-web-chunks.mjs` and `pnpm check:web:chunks`; root
`pnpm check:web` now runs this chunk boundary check after build and performance
budgets. Current verified gzip sizes are approximately:

```text
global vendor: 101.5 KiB
video-player: 208.3 KiB
tile-export: 27.7 KiB
```

- [x] **Step 11: Split Vditor read and write workflows**

The blog detail page uses the preview-only `vditor/dist/method.min` path while
the article editor uses the full Vditor editor. Vite now emits separate
`vditor-preview` and `vditor-editor` chunks. `CatalogCard` no longer imports
the full Vditor runtime for catalog rendering, and the blog module preload hook
now warms only `BlogDetailPage` instead of also pulling `ArticleEditorPage`.
`pnpm check:web:chunks` guards all of these boundaries. Current verified gzip
sizes are approximately:

```text
vditor-preview: 13.0 KiB
vditor-editor: 67.4 KiB
```

- [x] **Step 12: Split admin charts from the manage shell**

The manage page now loads `AdminChartsPage` asynchronously only when the chart
tab is selected. The admin module no longer declares a broad preload hook, so
admin routes rely on route-level lazy loading. Local chart page/UI/config code
builds into an `admin-charts` chunk, while ECharts and ZRender remain separate
heavy dependency chunks. `chartConfig.ts` uses type-only ECharts imports.
`pnpm check:web:chunks` now guards these boundaries. Current verified gzip size:

```text
admin-charts: 0.8 KiB
```

- [x] **Step 13: Split legacy page shells out of the entry chunk**

Removed the broad `src/pages/** -> index` manual chunk merge. Vite now names
the remaining legacy page shells explicitly: `page-game-tiles`, `page-tools`,
`page-keep`, `page-login`, `page-register`, `page-me`, `page-qq-callback`, and
`manage-shell`. The account module no longer preloads all account routes as one
group, so login/register/profile/callback can stay route-owned. `pnpm
check:web:chunks` guards the required page chunks and rejects the old broad
merge/preload patterns. Current verified gzip sizes are approximately:

```text
manage-shell: 11.2 KiB
page-me: 12.0 KiB
page-login: 3.8 KiB
page-register: 1.4 KiB
page-game-tiles: 3.0 KiB
page-keep: 1.3 KiB
page-tools: 0.4 KiB
page-qq-callback: 0.4 KiB
```

- [x] **Step 14: Remove UI primitive and startup Element coupling**

`@sun-world/ui` primitives no longer import Element Plus at runtime:
`SunButton`, `SunInput`, `SunDatePicker`, and `SunPagination` now use package
native implementations while keeping their public protocols and tests stable.
The app no longer imports the full Element theme stylesheet from `main.ts`.

HTTP error notifications now lazy-load Element Message and its CSS only when a
message is shown. Vite manual chunk source rules are scoped to `apps/web/src`
so third-party internals such as `element-plus/.../src/store` cannot be merged
into app-owned chunks. `contracts` and `shared-api` are explicit shared chunks,
preventing common API protocol code from being bundled into a route shell.

`pnpm check:web:chunks` now also rejects entry HTML preloads for route-only or
optional heavy chunks. Current verified gzip sizes are approximately:

```text
entry-index-js: 9.6 KiB
global vendor: 109.5 KiB
stores: 1.8 KiB
manage-shell: 3.8 KiB
page-login: 1.2 KiB
page-register: 1.5 KiB
element: 221.4 KiB, lazy/route-owned and not preloaded by index.html
```

- [x] **Step 15: Guard route constants against backend OpenAPI drift**

`@sun-world/contracts` now exports `API_ROUTE_METHODS` alongside
`API_ROUTES`. The contracts test suite verifies that every route constant has
method metadata and that every declared path/method exists in the generated
backend OpenAPI schema. This means frontend module API files consume route
constants, and route constants are now checked against backend route reality.

- [x] **Step 16: Add replaceable metrics snapshot storage**

`apps/api/src/core/metrics_store.py` now defines a small
`MetricsSnapshotStore` protocol with in-memory and JSON-file implementations.
Request metrics and RUM metrics save sanitized snapshots through this boundary
when admin snapshots are generated. `scripts/check-metrics-store.py` verifies
the protocol and is included in `pnpm check:api`.

- [x] **Step 17: Generate a frontend build artifact manifest**

`scripts/generate-web-build-manifest.mjs` writes
`apps/web/dist/build-manifest.json` after the web build, and
`scripts/check-web-build-manifest.mjs` verifies the manifest protocol. Root
`pnpm check:web` now runs generation and validation before budgets and chunk
boundary checks, giving future CI/release jobs a stable machine-readable input
for bundle size trend storage.

- [x] **Step 18: Make the root check entrypoint cross-platform**

`scripts/check-all.mjs` now owns root `pnpm check` orchestration. It runs the
root script protocol check, `git diff --check`, `pnpm check:web`,
`pnpm check:api`, and `pnpm check:compose` without requiring POSIX `bash`.
`scripts/check-root-check-script.mjs` guards against reintroducing bash-backed
root check scripts.

- [x] **Step 19: Add a platform goal evidence audit**

`scripts/check-platform-goal-audit.mjs` now verifies that durable evidence
exists for the original platform goal: commit/push policy, frontend-backend
chain, monitoring platform, UI package protocol, compose candidate, contracts,
backend metrics/RUM storage, telemetry client, build manifest, and
cross-platform verification entrypoints. Root `pnpm check` runs
`pnpm check:platform` before the heavier checks.

- [x] **Step 20: Add local metrics alert threshold evaluation**

`apps/api/src/core/metrics_alerts.py` evaluates request/RUM snapshots against
environment-configurable thresholds for request error rate, request p95
latency, and Web Vital poor rate. `scripts/check-metrics-alerts.py` verifies
the protocol and is included in `pnpm check:api`. Notification sending remains
disabled until a delivery channel is selected.

- [x] **Step 21: Expose local alert thresholds to admin**

`apps/api/src/core/admin_alerts.py` now assembles request/RUM threshold results
into an `AdminAlertsSnapshot`, exposed through authenticated `GET
/admin/alerts`. `@sun-world/contracts` includes the route and generated OpenAPI
types, and the admin metrics page loads alerts with request metrics and RUM
metrics to show active critical/warning rules. `scripts/check-admin-alerts.py`
locks the read-model protocol and is included in `pnpm check:api`.

- [x] **Step 22: Avoid duplicate snapshot writes during alert reads**

`RequestMetricsCollector.snapshot()` and `RumMetricsCollector.snapshot()` now
accept `persist=True` by default, preserving existing behavior for
`GET /admin/metrics` and `GET /admin/telemetry`. `GET /admin/alerts` reads both
collectors with `persist=False`, so alert calculation does not write duplicate
snapshot-history entries when the admin page refreshes all monitoring panels
together. `scripts/check-admin-alerts.py` verifies this non-persisting path.

- [x] **Step 23: Expose bounded metrics snapshot history**

`apps/api/src/core/metrics_history.py` now exposes a bounded admin read model
for request/RUM snapshot history, backed by the replaceable metrics snapshot
store. The authenticated endpoint is `GET /admin/metrics/history` with typed
`kind=request|rum` and `limit` query parameters. Contracts/OpenAPI were
regenerated, the admin metrics page shows request/RUM history sample counts,
and `scripts/check-admin-metrics-history.py` verifies the protocol in
`pnpm check:api`.

- [x] **Step 24: Generate compact frontend build summary**

`scripts/generate-web-build-summary.mjs` now consumes the generated build
manifest and performance budget config to write
`apps/web/dist/build-summary.json`. The summary keeps total gzip fields, top 10
largest assets, and machine-readable budget results for future CI/release
trend storage. `scripts/check-web-build-summary.mjs` verifies the protocol, and
`pnpm check:web` runs summary generation and validation after manifest checks
and before budgets/chunk boundaries.

- [x] **Step 25: Guard UI package minimal imports**

`scripts/check-ui-package-boundary.mjs` now verifies the web app imports
`@sun-world/ui` runtime components only through documented subpath entries,
verifies the package export surface for those subpaths, rejects root/internal
UI imports from app code, and rejects a shared `ui.*` web chunk in production
dist. Vite no longer forces `packages/ui` into one manual chunk, and production
HTML strips preloads/stylesheets for route-only optional heavy chunks so UI
subpath imports stay consumer-owned.

- [x] **Step 26: Verify UI package test/build in the root check**

`scripts/check-all.mjs` now runs `pnpm test:ui` and `pnpm build:ui` before the
frontend app check. `scripts/check-platform-goal-audit.mjs` verifies those
commands stay in the root check chain, so UI component protocol tests and
package build outputs remain independently verified instead of only being
covered by the consuming app bundle.
