"""Migration-only admin baseline. Never grants business or Agent capabilities."""

from dataclasses import dataclass
from typing import Callable

from . import Principal


# Explicit reviewed HTTP operations, not prefixes or database resource grants.
# Changes must also pass scripts/check-admin-policy.py against composed routes.
ADMIN_OPERATIONS = frozenset(tuple(line.split()) for line in """
POST /blogs/
DELETE /blogs/{blog_id}
PUT /blogs/{blog_id}
POST /user/
GET /user/{user_id}
GET /user/
DELETE /user/{user_id}
POST /role/
GET /role/{role_id}
GET /role/
PUT /role/{role_id}
DELETE /role/{role_id}
POST /role/{role_id}/bind_resources
POST /resource/
GET /resource/{resource_id}
GET /resource/
PUT /resource/{resource_id}
DELETE /resource/{resource_id}
POST /file/video/upload
POST /file/image/upload
GET /admin/ai/providers
POST /admin/ai/providers
PUT /admin/ai/providers/{provider_id}
DELETE /admin/ai/providers/{provider_id}
GET /admin/metrics
GET /admin/telemetry
GET /admin/alerts
GET /admin/metrics/history
GET /admin/logs
GET /admin/ai/metrics
GET /admin/dictionaries/types
POST /admin/dictionaries/types
PUT /admin/dictionaries/types/{type_id}
DELETE /admin/dictionaries/types/{type_id}
GET /admin/dictionaries/types/{type_id}/items
POST /admin/dictionaries/types/{type_id}/items
PUT /admin/dictionaries/types/{type_id}/items/{item_id}
DELETE /admin/dictionaries/types/{type_id}/items/{item_id}
GET /admin/comments
PUT /admin/comments/{comment_id}
""".splitlines() if line)


def admin_baseline(principal: Principal, method: str, route: str) -> bool:
    return (
        (method, route) in ADMIN_OPERATIONS
        and principal.kind == "user"
        and type(principal.user_id) is int and principal.user_id > 0
        and "admin" in principal.roles
    )


@dataclass(frozen=True)
class ShadowComparison:
    legacy_allowed: bool
    candidate_allowed: bool | None
    event: str | None


def compare_admin_policy(
    principal: Principal, method: str, route: str, *, legacy_allowed: bool,
    candidate: Callable = admin_baseline,
) -> ShadowComparison:
    try:
        allowed = candidate(principal, method, route)
        if type(allowed) is not bool:
            raise ValueError("Invalid policy result")
    except Exception:
        return ShadowComparison(legacy_allowed, None, "admin_policy_shadow_error")
    if (method, route) not in ADMIN_OPERATIONS:
        event = "admin_policy_shadow_unmapped"
    elif allowed != legacy_allowed:
        event = "admin_policy_shadow_candidate_allow" if allowed else "admin_policy_shadow_candidate_deny"
    else:
        event = None
    return ShadowComparison(legacy_allowed, allowed, event)


def observe_admin_policy(current_user, method: str, route: str, legacy_allowed: bool, record):
    """Observe verified legacy context; no second token lookup or cached allow.

    Failures of candidate evaluation or telemetry must not change legacy access.
    Audit payload excludes user IDs, cookies, raw paths, query strings and errors.
    """
    try:
        get = current_user.get if isinstance(current_user, dict) else lambda k, d: getattr(current_user, k, d)
        roles = tuple(
            str(role.get("code", "")).strip().lower()
            for role in get("roles", []) if isinstance(role, dict)
        )
        principal = Principal(kind="user", user_id=get("id", None), roles=roles)
        result = compare_admin_policy(principal, method, route, legacy_allowed=legacy_allowed)
        if result.event:
            known = (method, route) in ADMIN_OPERATIONS
            record(result.event, severity="warning", method=method if known else "UNKNOWN",
                   route=route if known else "<unmapped>")
    except Exception:
        # Never include exception text: dependencies may carry sensitive values.
        return
