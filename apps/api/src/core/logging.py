"""
Application logging configuration.

The API keeps log delivery intentionally simple: stdout/stderr only, no file
rotation and no external SDK. Production can switch to machine-readable JSON
with BLOG_LOG_FORMAT=json while development keeps readable text output.
"""

import os
import sys
from typing import Final

from loguru import logger

_VALID_LEVELS: Final[set[str]] = {
    "DEBUG",
    "INFO",
    "WARNING",
    "ERROR",
    "CRITICAL",
}

_configured = False


def configure_logging() -> None:
    """Configure loguru once from safe, non-secret environment flags."""
    global _configured
    if _configured:
        return

    level = _normalise_level(os.getenv("BLOG_LOG_LEVEL"))
    serialize = _normalise_format(os.getenv("BLOG_LOG_FORMAT")) == "json"
    backtrace = _env_truthy(os.getenv("BLOG_LOG_BACKTRACE"))
    diagnose = _env_truthy(os.getenv("BLOG_LOG_DIAGNOSE"))

    logger.remove()
    logger.add(
        sys.stderr,
        level=level,
        serialize=serialize,
        backtrace=backtrace,
        diagnose=diagnose,
        enqueue=True,
    )
    _configured = True


def _normalise_level(raw: str | None) -> str:
    if not raw:
        return "INFO"

    level = raw.strip().upper()
    if level in _VALID_LEVELS:
        return level
    return "INFO"


def _normalise_format(raw: str | None) -> str:
    if not raw:
        return "text"

    value = raw.strip().lower()
    if value == "json":
        return "json"
    return "text"


def _env_truthy(raw: str | None) -> bool:
    if not raw:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}
