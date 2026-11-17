"""Shared primary-authentication window; no HTTP or service dependencies."""

import os


ADMIN_STEP_UP_OPERATIONS = frozenset(tuple(line.split()) for line in """
POST /user/
DELETE /user/{user_id}
POST /role/
PUT /role/{role_id}
DELETE /role/{role_id}
POST /role/{role_id}/bind_resources
POST /resource/
PUT /resource/{resource_id}
DELETE /resource/{resource_id}
""".splitlines() if line)


def step_up_max_age_seconds() -> int:
    try:
        value = int(os.getenv("AUTH_STEP_UP_MAX_AGE_SECONDS", "600"))
    except (TypeError, ValueError):
        raise ValueError("Invalid recent authentication configuration") from None
    if value < 60 or value > 3600:
        raise ValueError("Invalid recent authentication configuration")
    return value
