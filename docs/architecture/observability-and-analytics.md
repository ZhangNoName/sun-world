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
| Web Vitals | `web-vitals` library, dynamic import | `shared/telemetry/index.ts` |
| Route timing | Vue Router guards | `shared/telemetry/index.ts` |
| Global errors | `window.onerror` + `unhandledrejection` | `shared/telemetry/index.ts` |

### Behaviour

- **Development:** All metrics logged to the console with `[telemetry]` prefix.
- **Production:** Adapter is a no-op — metrics are captured but not forwarded anywhere yet.

### Phase 2 Plan

- Forward Web Vitals to a self-hosted or vendor analytics endpoint.
- Add custom user-action events (button clicks, form submissions, search queries).
- Add API request timing integration (`shared/api` interceptor hook).
- Consider a lightweight RUM (Real User Monitoring) dashboard in the admin module.

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

### Current State

The backend uses the unified `{ code, data, msg }` envelope (`apps/api/src/core/response.py`). Error codes are defined in `apps/api/src/core/error_codes.py`.

### Phase 2 Plan

- **Request ID middleware.** Assign a unique ID to every incoming request, returned in response headers and included in logs.
- **Structured logging.** Move from `print()` / ad-hoc logging to structured JSON logs with timestamp, level, request ID, route, and error code.
- **Request timing logs.** Log request duration for every endpoint (or sample for high-traffic routes).
- **Error code and route tags.** Every log line related to a request should carry the route and the resulting error code when applicable.

### Phase 3 Plan

- OpenTelemetry hooks for distributed tracing.
- Backend metrics endpoint for admin dashboard consumption.
- Alerting thresholds for error rate, latency, and availability.

## Admin Dashboard (Future)

The admin module (`modules/admin`) will eventually consume analytics data through a clean API:

- Frontend: Web Vitals trends, page-level performance, error rates.
- Backend: Request volume, latency percentiles, error-code distribution.
- Content: Article views, AI generation counts, editor session metrics.

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
