"""
Per-request context backed by contextvars.

Provides request_id that is automatically isolated per request/async task,
so controllers and services can attach the current request_id to their own
log lines without threading a parameter through every call.
"""

import uuid
from contextvars import ContextVar, Token

_request_id_var: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Return the current request ID, or empty string if not yet set."""
    return _request_id_var.get()


def set_request_id(request_id: str) -> Token[str]:
    """Set the request ID for the current request context."""
    return _request_id_var.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    """Reset request ID context after request handling completes."""
    _request_id_var.reset(token)


def generate_request_id() -> str:
    """Generate a new UUID4 hex string suitable for use as a request ID."""
    return uuid.uuid4().hex
