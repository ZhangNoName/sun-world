"""Runtime security mode independent from the YAML configuration profile."""

from __future__ import annotations

import os


LOCAL_RUNTIME_ENVIRONMENTS = {"local", "dev", "development", "test"}


def get_runtime_environment() -> str:
    """Return the security/runtime mode without changing config selection.

    ``ENV`` remains the historical YAML profile selector. Deployments should
    set ``BLOG_RUNTIME_ENV=production`` so cookie, CORS, CSRF and public-origin
    defaults fail closed even when the server still loads ``local.yml`` plus a
    secret override file.
    """

    return (
        os.getenv("BLOG_RUNTIME_ENV")
        or os.getenv("ENV")
        or "local"
    ).strip().lower()


def is_local_runtime() -> bool:
    return get_runtime_environment() in LOCAL_RUNTIME_ENVIRONMENTS
