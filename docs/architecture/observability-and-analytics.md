# Observability and Analytics

This document describes the observability strategy for Sun World, covering both frontend and backend.

## Design Principles

- **Observability before urgency.** Instrument the platform while it is small so that data exists when it is needed.
- **Vendor-neutral.** Telemetry primitives are generic; the adapter pattern allows swapping backends without rewriting instrumented code.
- **Dev-friendly.** Metrics are visible in development with zero configuration.
- **Privacy-aware.** No PII in telemetry events; aggregate only.

## Frontend

### Phase 1 (Implemented)

| Capability | Implementation | Location |
|---|---|---|
| Telemetry client | Vendor-neutral `trackEvent()` + replaceable reporter | `shared/telemetry/index.ts` |
| Web Vitals | `web-vitals` library, dynamic import | `shared/telemetry/index.ts` |
| Route timing | Vue Router guards emitting `route_timing` events | `shared/telemetry/index.ts` |
| Global errors | `window.onerror` + `unhandledrejection` events | `shared/telemetry/index.ts` |
| API timing/errors | HTTP wrapper emits `api_timing` and `api_error` events | `service/http.ts` |
| Frontend request correlation | `X-Request-ID` generation, propagation, and telemetry enrichment | `shared/observability/request-id.ts`, `service/http.ts` |

### Behaviour

- **Development:** Events are logged to the console with `[telemetry]` prefix.
- **Production without endpoint:** Adapter is a no-op.
- **Production with `VITE_TELEMETRY_ENDPOINT`:** Events are sent as JSON through `navigator.sendBeacon` or `fetch(..., keepalive: true)`.
- **Custom reporter:** `setTelemetryReporter()` can replace delivery with a self-hosted collector or vendor SDK without changing feature modules.

### Phase 2 Plan

- Add custom user-action events (button clicks, form submissions, search queries).
- Consider a lightweight RUM (Real User Monitoring) dashboard in the admin module.

### Phase 17 — Frontend Request Correlation (Implemented)

The frontend now participates in the same request-id chain as the monorepo
backend middleware. Every JSON API call automatically gets a safe
`X-Request-ID`; when the backend runtime echoes the ID, frontend telemetry and
`ApiError` preserve it for support and log lookup.

**Files:**

| File | Purpose |
|---|---|
| `apps/web/src/shared/observability/request-id.ts` | Safe request-id generation, normalisation, header reading, and header-name constants. |
| `apps/web/src/service/http.ts` | Adds `X-Request-ID` to every Axios request, captures response IDs, stores `requestId` on `ApiError`, and forwards it to telemetry. |
| `apps/web/src/shared/telemetry/index.ts` | Extends `ApiTelemetryContext` so `api_timing` and `api_error` events can include `requestId`. |

**Behaviour:**

- If a caller already provides a safe `X-Request-ID`, the HTTP layer preserves it.
- Otherwise the browser generates a new UUID-style ID.
- The value is bounded to 128 characters and must match the same safe character
  set accepted by the backend middleware.
- `ApiError.requestId` is set from the backend response header when available,
  falling back to the client-generated ID.
- Telemetry event properties include `requestId`, but never include request
  bodies, credentials, cookies, or query strings.

**Debug flow:**

1. User reports an error with a visible failure time.
2. Frontend telemetry `api_error.properties.requestId` identifies the request.
3. Backend logs can be searched for `request_id=<same-id>`.
4. Admin request metrics remain aggregate; detailed inspection still comes from
   logs or a future persistent telemetry store.

### Metrics Collected (Web Vitals)

| Metric | Description |
|---|---|
| LCP (Largest Contentful Paint) | Loading performance |
| FID (First Input Delay) | Interactivity (pre-March 2024) |
| INP (Interaction to Next Paint) | Interactivity (post-March 2024) |
| CLS (Cumulative Layout Shift) | Visual stability |
| FCP (First Contentful Paint) | Perceived load speed |
| TTFB (Time to First Byte) | Server responsiveness |

## Backend

### Phase 8 — Request Observability (Implemented)

The backend now has request-level observability via a Starlette middleware and
structured exception-handler logging.

**Files:**

| File | Purpose |
|---|---|
| `apps/api/src/core/request_context.py` | `ContextVar`-backed `request_id` storage. |
| `apps/api/src/core/observability.py` | `ObservabilityMiddleware` — request ID propagation, timing, and structured logging. |
| `apps/api/main.py` | Exception handlers log `request_id`, method, path, and error context. |
| `apps/api/app_instance.py` | Registers `ObservabilityMiddleware` after CORS so Starlette builds it as the outer project middleware. |

**Behaviour:**

1. **Request ID propagation**
   - Reads `X-Request-ID` or `X-Correlation-ID` from the incoming request.
   - Accepts only bounded, safe request ID characters; invalid or oversized IDs
     are replaced with a freshly generated ID.
   - Falls back to a freshly generated UUID4 hex string when neither header is present.
   - Stores the ID in a `ContextVar` (`request_context.get_request_id()`) so
     controllers and services can attach it to their own log lines.
   - Writes `X-Request-ID` into every response header.
   - Resets the context after request handling to prevent cross-request leakage.

2. **Per-request structured logging**
   - Every non-noisy request logs one line at `INFO` level with these fields:
     `request_id`, `method`, `path`, `status`, `duration_ms`, `client`, `ua`, `route`.
   - Noisy paths (`/healthz`, `/favicon.ico`, `/robots.txt`) are logged at
     `DEBUG` level to avoid flooding production logs.

3. **Exception logging**
   - `StarletteHTTPException` → logged at `WARNING` with `request_id`, method,
     path, status, and detail.
   - `RequestValidationError` → logged at `WARNING` with a validation-error count;
     individual field errors are logged at `DEBUG`.
   - General `Exception` → logged at `ERROR` with `logger.exception()` so the
     traceback is captured, plus `request_id`, method, path, exception type,
     and a bounded single-line detail.
   - All exception handlers return the **same** `{ code, data, msg }` envelope
     as before — response structure and status codes are unchanged.

**Security / privacy rules (enforced by the implementation):**

| Rule | How |
|---|---|
| No `Authorization`, `Cookie`, `X-Api-Key` in logs | Middleware never reads or logs credential headers. |
| No query strings in logs | Only `request.url.path` is logged, never `query_string`. |
| No request bodies in logs | Body is never read or logged by the middleware. |
| No passwords, tokens, keys, or env values | Log statements use request metadata and bounded error summaries only. |
| `User-Agent` truncation | Truncated to 200 characters (only first 80 chars appear in the log message). |
| Incoming request ID safety | IDs longer than 128 chars or containing unsafe characters are discarded. |

### Backend Log Contract

Every INFO-level request log line follows this format:

```
request_id=<uuid4-hex> method=<VERB> path=<path> status=<code> duration_ms=<float> client=<host> ua=<truncated> route=<route_name>
```

Example (wrapped for readability):

```
2026-06-07T12:00:00.000+0800 INFO request_id=a1b2c3d4e5f6 method=GET path=/api/blogs status=200 duration_ms=42.17 client=10.0.0.1 ua=Mozilla/5.0... route=blog_list
```

### Phase 9 — Structured JSON Logging (Implemented)

**Files:**

| File | Purpose |
|---|---|
| `apps/api/src/core/logging.py` | `configure_logging()` — idempotent loguru sink setup. |
| `apps/api/app_instance.py` | Calls `configure_logging()` early, before the `Application` class. |

**Behaviour:**

`configure_logging()` reads non-secret environment variables and configures
loguru with a single sink to `sys.stderr`.  No files are written.  The
function is safe to call multiple times — subsequent calls are no-ops.

| Env variable | Default | Effect |
|---|---|---|
| `BLOG_LOG_FORMAT=json` | (unset) | Enables `serialize=True` on the stderr sink so every log line is a valid JSON object. |
| `BLOG_LOG_LEVEL` | `INFO` | Sets the minimum log level; must be one of `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`.  Invalid values fall back to `INFO`. |
| `BLOG_LOG_BACKTRACE` | `false` | When set to `true`/`1`/`yes`/`on`, enables loguru `backtrace` (default **off** — avoid exposing internal state in production logs). |
| `BLOG_LOG_DIAGNOSE` | `false` | When set to `true`/`1`/`yes`/`on`, enables loguru `diagnose` (default **off** — avoid exposing variable values in production logs). |

**Security / safety rules:**

| Rule | How |
|---|---|
| `backtrace` and `diagnose` are disabled by default | Env-var opt-in only; production must not enable them casually. |
| No file sinks | All log output goes to `sys.stderr` — the process manager (e.g. systemd/journald) handles persistence. |
| No new dependencies | Uses the existing `loguru` dependency already relied on by the application. |
| Idempotent | Repeated calls to `configure_logging()` produce exactly one loguru sink. |
| No secrets in env reading | Only well-known configuration env vars are read; no credential-like variables are accessed. |

**Log contract (JSON mode):**

When `BLOG_LOG_FORMAT=json`, every log line is a single JSON object with
loguru's standard record fields (`time`, `level`, `message`, `module`,
`function`, `line`, `process`, `thread`, `exception`, etc.).  The
semantic content of the `message` field follows the Phase 8 log contract.

**Log contract (text mode, default):**

Human-readable format with timestamp, level, module location, and
message — identical to loguru's default sink format.

### Phase 21 — Backend Readiness Probe

The monorepo backend candidate now separates process liveness from dependency
readiness.

**Files:**

| File | Purpose |
|---|---|
| `apps/api/src/routers/health/health.py` | Owns `/healthz` and `/readyz` operational probe routes. |
| `apps/api/src/core/readiness.py` | Runs bounded dependency probes and builds a safe readiness snapshot. |
| `apps/api/src/type/health_type.py` | Pydantic models for health and readiness responses. |
| `scripts/export-openapi.py` | Includes the health router in the schema-only OpenAPI export. |

**Endpoint contract:**

| Endpoint | Meaning | Status |
|---|---|---|
| `GET /healthz` | Process is alive and can serve a minimal response. | Always `200` while the process is running. |
| `GET /readyz` | Required dependencies are reachable. | `200` when all probes pass, `503` when any probe fails or times out. |

`/readyz` checks MySQL, MongoDB, Redis, and PostgreSQL through existing manager
probe methods. Each check is bounded to one second and returns only dependency
name, readiness status, and duration. It does not expose hosts, users, DSNs,
passwords, query details, or exception messages.

Both `/healthz` and `/readyz` are treated as noisy operational paths by the
observability middleware, so they are logged at `DEBUG` level and excluded from
the in-memory request metrics snapshot.

### Phase 10 — Admin Request Metrics Snapshot (Implemented)

The backend exposes a small authenticated read model for the admin module.
It is intentionally in-memory and process-local: metrics reset when the API
process restarts and are not a substitute for long-term observability storage.

**Files:**

| File | Purpose |
|---|---|
| `apps/api/src/core/metrics.py` | Thread-safe, bounded request metrics accumulator. |
| `apps/api/src/core/observability.py` | Records request metrics after logging each non-noisy request. |
| `apps/api/src/type/admin_type.py` | Pydantic response models for admin metrics contracts. |
| `apps/api/src/routers/admin/admin.py` | Authenticated `GET /admin/metrics` endpoint. |
| `apps/web/src/modules/admin/api.ts` | Typed frontend API for fetching admin metrics. |
| `apps/web/src/modules/admin/types.ts` | Frontend types derived from generated OpenAPI contracts. |

**Endpoint:**

`GET /admin/metrics`

- Requires the existing login cookie via `get_current_user`.
- Returns the standard `{ code, data, msg }` envelope.
- Skips noisy health/static probe paths (`/healthz`, `/favicon.ico`, `/robots.txt`).
- Aggregates route templates where FastAPI exposes them, which avoids storing
  high-cardinality raw IDs in metrics keys.

**Snapshot fields:**

| Field | Description |
|---|---|
| `generated_at` | Snapshot generation timestamp. |
| `total_requests` | Total non-noisy requests observed by this process. |
| `error_requests` | Total 5xx responses observed by this process. |
| `avg_duration_ms` | Average request duration. |
| `max_duration_ms` | Maximum request duration. |
| `routes` | Per-method/per-route counts, 5xx counts, average latency, and max latency. |
| `statuses` | Status-code distribution. |

**Limitations by design:**

- Process-local memory only; multi-process deployments need aggregation later.
- No percentiles yet because no histogram backend is attached.
- No user identifiers, request bodies, query strings, or credential headers are
  recorded.

### Phase 16 — Admin Metrics View (Implemented)

The admin module now has a real frontend boundary for backend request metrics.
This turns the Phase 10 endpoint into an inspectable operations surface without
coupling the UI to legacy service folders.

**Files:**

| File | Purpose |
|---|---|
| `apps/web/src/modules/admin/composables/useAdminMetrics.ts` | Fetches metrics, owns loading/error state, derives metric cards, sorted route rows, and status rows. |
| `apps/web/src/modules/admin/errors.ts` | Admin-domain error resolver backed by the shared error registry. |
| `apps/web/src/modules/admin/pages/AdminMetricsPage.vue` | Responsive metrics dashboard for request totals, errors, latency, route metrics, and status-code distribution. |
| `apps/web/src/modules/admin/index.ts` | Registers `/manage/metrics`, SEO metadata, navigation item, and preload hook. |
| `apps/web/src/pages/manage/index.vue` | Adds a "请求指标" tab and lazy-loads the metrics page from the admin module. |

**UI contract:**

- `/manage/metrics` is the direct metrics route.
- `/manage` also exposes the metrics view through the existing management menu.
- The view uses design tokens for color, spacing, border, typography, and
  reduced-motion behavior.
- Metrics cards and route/status lists are responsive down to mobile widths.
- The page is lazy-loaded as its own Vite chunk.

**Scope:**

- This is an operational snapshot, not a historical analytics warehouse.
- It uses the current in-memory API process snapshot and refreshes only on user
  action.
- Future persistent analytics should reuse the module boundary and replace the
  data source behind `useAdminMetrics()`.

### Future Phases

- **OpenTelemetry hooks.** Add distributed tracing context propagation
  (`traceparent` / `tracestate`) alongside the existing request ID.
- **Persistent analytics store.** Persist metrics/events for long-term admin
  dashboards and historical trend analysis.
- **Alerting thresholds.** Define alert rules for error rate, p95 latency,
  and availability.

## Admin Dashboard

The admin module (`modules/admin`) consumes analytics data through clean module
APIs and composables:

- Implemented: backend request volume, error count, average/max latency, route
  metrics, and status-code distribution.
- Future: frontend Web Vitals trends, page-level performance, error-code
  distribution, content views, AI generation counts, and editor session metrics.

This dashboard should be built from the telemetry primitives defined here, not from raw log scraping.

## Adapter Pattern

Both frontend and backend telemetry use an adapter pattern:

```
Instrumentation  →  Adapter  →  Backend
                                  ├── Console (dev)
                                  ├── Custom endpoint (prod Phase 2)
                                  └── Third-party SDK (future)
```

Switching from console to a real backend means replacing the adapter — the instrumented code does not change.

## Event Contract

Frontend events use this stable envelope:

```ts
interface TelemetryEvent {
  name:
    | 'web_vital'
    | 'route_timing'
    | 'global_error'
    | 'unhandled_rejection'
    | 'api_timing'
    | 'api_error'
    | 'user_action'
  severity: 'debug' | 'info' | 'warning' | 'error'
  timestamp: string
  page: string
  sessionId: string
  properties?: Record<string, unknown>
}
```

For `api_timing` and `api_error`, `properties.requestId` is present when the
request went through the shared HTTP layer.

Rules:

- Do not include passwords, tokens, private keys, raw request bodies, or full PII values.
- API URLs are normalised without query strings.
- Production delivery is disabled until `VITE_TELEMETRY_ENDPOINT` is configured.
