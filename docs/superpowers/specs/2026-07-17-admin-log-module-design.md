# Admin Log Module Design

## Goal

Provide a low-coupling, privacy-safe operational log module that records
important backend lifecycle and request events, detects an unclean restart,
and lets authenticated administrators inspect a bounded recent log history.

## Chosen approach

Use an application-core audit-log port with a local JSONL adapter. This keeps
domain routers and controllers independent from log files while avoiding a new
database table or external observability dependency.

Alternatives considered:

1. Persist every Loguru line and expose it directly. Rejected because it
   couples the UI to unstructured implementation logs and makes retention and
   redaction difficult.
2. Introduce a database-backed audit table. Rejected for this iteration: it
   adds a schema migration and makes a crash path depend on database health.
3. Use a bounded JSONL audit store. Selected: it is available before database
   initialization, is easy to rotate, and exposes a typed read model.

## Architecture

`AuditLogService` is the sole application-facing port. Its file adapter writes
one sanitized JSON document per line and owns retention, rotation, querying,
and lifecycle state. `ObservabilityMiddleware` emits request failures and
successful state-changing requests through that port; it never knows the file
format. The FastAPI lifespan emits startup, graceful-shutdown, and
unclean-restart events through the same port.

The admin router consumes the read side only. The web admin module consumes a
typed generated API contract through its own `api.ts` and composable. No
frontend business page or backend controller reads log files directly.

## Recorded events and privacy

The module records:

- `service_started`, `service_stopped`, and `service_restarted_uncleanly`.
- successful POST, PUT, PATCH, and DELETE request audits;
- failed requests with status 500 or above.

Each event contains only timestamp, severity, stable event type, request ID,
method, route template/path, status, and rounded duration where relevant.
It never persists request bodies, query strings, cookies, authorization data,
IP addresses, user agents, environment values, exception text, or user data.

## Retention and failure behaviour

The default store keeps one active JSONL file of at most 1 MiB and two rotated
files, for a hard 3 MiB upper bound. It retains a maximum of 100 records per
read response. Configurable non-secret `BLOG_AUDIT_LOG_*` settings can adjust
directory, file size, and file count within safe minimum/maximum bounds.

If the log directory is unavailable or an append fails, the API request still
completes. The failure is sent to the existing stderr logger; business traffic
is never blocked by observability.

Startup creates a small runtime marker. Graceful shutdown removes it only
after recording its stop event. A later startup finding the marker records an
unclean-restart event before replacing the marker, which covers crashes,
forced termination, and host restarts that do not run lifespan shutdown.

## API and UI

`GET /admin/logs` requires the existing login dependency and accepts bounded
`limit`, optional `severity`, and optional `event_type` filters. It returns
newest-first events plus the active retention configuration. The admin module
adds a dedicated `/manage/logs` route and menu entry, with loading, empty,
error, refresh, filter, and accessible event-list states.

## Verification

Tests cover JSONL sanitization, retention/rotation, filtered newest-first
reads, write-failure isolation, lifecycle clean shutdown, and unclean restart
detection. Router/schema tests prove the protected API contract. Frontend
checks prove generated contract usage and the log page's typed API boundary;
the web type-check and build validate integration.
