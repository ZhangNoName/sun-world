"""Shared OpenAPI security declarations for cookie-backed browser sessions."""

from fastapi.security import APIKeyCookie


access_token_cookie = APIKeyCookie(
    name="access_token",
    scheme_name="CookieSession",
    description="HttpOnly access-token cookie issued by Sun World authentication endpoints.",
    auto_error=False,
)
