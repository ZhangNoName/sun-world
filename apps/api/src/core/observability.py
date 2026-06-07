"""
Request-level observability middleware.

Provides:
- Request ID extraction, generation, and propagation (X-Request-ID / X-Correlation-ID).
- Structured per-request logging with timing, without logging sensitive data.
- Sensible defaults: /healthz and similar noiseless paths are logged at DEBUG level.

Intended to be registered once in app_instance.py via self.add_middleware().
"""

import re
import time

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .metrics import record_request_metric
from .request_context import (
    generate_request_id,
    get_request_id,
    reset_request_id,
    set_request_id,
)

# Paths that should never produce INFO-level request logs.
_HEALTH_CHECK_PATHS: set[str] = {
    "/healthz",
    "/readyz",
    "/favicon.ico",
    "/robots.txt",
}

_MAX_USER_AGENT_LENGTH = 200
_MAX_LOG_VALUE_LENGTH = 200
_MAX_REQUEST_ID_LENGTH = 128
_SAFE_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]+$")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that instruments every HTTP request.

    Behaviour
    ---------
    1. Reads ``X-Request-ID`` or ``X-Correlation-ID`` from the incoming
       request.  Falls back to a freshly generated UUID4 hex string.
    2. Stores the request_id in a context variable so downstream code
       (controllers, services) can attach it to their own logs.
    3. Measures wall-clock duration in milliseconds.
    4. Appends ``X-Request-ID`` to the response headers.
    5. Logs a single structured ``request`` line with the fields described
       in ``docs/architecture/observability-and-analytics.md``.

    Security / privacy
    ------------------
    - Authorization, Cookie, and other credential-like headers are never
      logged.
    - Query strings and request bodies are never logged.
    - The ``user_agent`` field is truncated to a maximum of
      ``_MAX_USER_AGENT_LENGTH`` characters.
    - No environment-variable values appear in log output.
    """

    async def dispatch(self, request: Request, call_next):
        # ── Request ID ────────────────────────────────────────────────
        request_id = resolve_request_id(request)
        context_token = set_request_id(request_id)

        # ── Timing ────────────────────────────────────────────────────
        start = time.monotonic()

        try:
            response: Response = await call_next(request)
            duration_ms = (time.monotonic() - start) * 1000
            response.headers["X-Request-ID"] = request_id
            self._log(request, response.status_code, duration_ms)
            self._record_metrics(request, response.status_code, duration_ms)
            return response
        except Exception:
            duration_ms = (time.monotonic() - start) * 1000
            self._log(request, 500, duration_ms)
            self._record_metrics(request, 500, duration_ms)
            raise
        finally:
            reset_request_id(context_token)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _log(self, request: Request, status_code: int, duration_ms: float) -> None:
        path = request.url.path
        is_noisy = path in _HEALTH_CHECK_PATHS

        route_name = ""
        route = request.scope.get("route")
        if route is not None and hasattr(route, "name") and route.name:
            route_name = route.name

        client_host = ""
        if request.client is not None:
            client_host = request.client.host

        user_agent = ""
        raw_ua = request.headers.get("user-agent", "")
        if raw_ua:
            user_agent = raw_ua[:_MAX_USER_AGENT_LENGTH]

        msg = (
            f"request_id={get_request_id()} "
            f"method={request.method} "
            f"path={path} "
            f"status={status_code} "
            f"duration_ms={round(duration_ms, 2)} "
            f"client={safe_log_value(client_host) or '-'} "
            f"ua={safe_log_value(user_agent, max_length=80) or '-'} "
            f"route={safe_log_value(route_name) or '-'}"
        )

        if is_noisy:
            logger.debug(msg)
        else:
            logger.info(msg)

    def _record_metrics(
        self,
        request: Request,
        status_code: int,
        duration_ms: float,
    ) -> None:
        path = request.url.path
        if path in _HEALTH_CHECK_PATHS:
            return

        route_key = path
        route = request.scope.get("route")
        route_path = getattr(route, "path", "") if route is not None else ""
        if route_path:
            route_key = route_path

        record_request_metric(
            method=request.method,
            route=route_key,
            status_code=status_code,
            duration_ms=duration_ms,
        )


def resolve_request_id(request: Request) -> str:
    """Return a safe request ID from headers or generate a new one."""
    candidate = (
        request.headers.get("X-Request-ID")
        or request.headers.get("X-Correlation-ID")
        or ""
    ).strip()

    if (
        candidate
        and len(candidate) <= _MAX_REQUEST_ID_LENGTH
        and _SAFE_REQUEST_ID_RE.match(candidate)
    ):
        return candidate

    return generate_request_id()


def safe_log_value(value: object, max_length: int = _MAX_LOG_VALUE_LENGTH) -> str:
    """Convert a value to a single-line, bounded log string."""
    if value is None:
        return ""

    text = str(value).replace("\n", " ").replace("\r", " ").strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."
