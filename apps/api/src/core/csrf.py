"""Origin-based CSRF protection for cookie-authenticated mutations."""

from collections.abc import Iterable
from urllib.parse import urlsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .response import fail


_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_SESSION_COOKIES = {"access_token", "refresh_token"}


def canonical_origin(value: str | None) -> str | None:
    """Return a comparable HTTP origin without paths or default ports."""
    if not value:
        return None
    try:
        parsed = urlsplit(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username is not None or parsed.password is not None:
            return None
        port = parsed.port
    except ValueError:
        return None

    default_port = 80 if parsed.scheme == "http" else 443
    port_suffix = "" if port in {None, default_port} else f":{port}"
    return f"{parsed.scheme}://{parsed.hostname.casefold()}{port_suffix}"


class CookieCsrfMiddleware(BaseHTTPMiddleware):
    """Reject cross-origin writes whenever a browser session cookie is used.

    Bearer-token and anonymous API clients remain unaffected. OAuth callbacks
    are GET requests and retain their separate one-time state verification.
    """

    def __init__(self, app, *, allowed_origins: Iterable[str]):
        super().__init__(app)
        self.allowed_origins = {
            origin
            for raw_origin in allowed_origins
            if (origin := canonical_origin(raw_origin)) is not None
        }

    async def dispatch(self, request: Request, call_next):
        if not self._requires_origin_check(request):
            return await call_next(request)

        supplied_origin = request.headers.get("origin")
        if supplied_origin is None:
            supplied_origin = request.headers.get("referer")
        origin = canonical_origin(supplied_origin)

        if origin not in self.allowed_origins:
            return JSONResponse(
                status_code=403,
                content=fail(msg="请求来源校验失败", code=403).model_dump(),
            )
        return await call_next(request)

    @staticmethod
    def _requires_origin_check(request: Request) -> bool:
        if request.method.upper() not in _UNSAFE_METHODS:
            return False
        return any(cookie_name in request.cookies for cookie_name in _SESSION_COOKIES)
