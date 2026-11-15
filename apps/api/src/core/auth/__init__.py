"""Server-owned identity and policy primitives; no HTTP or business imports."""

from dataclasses import dataclass
from typing import Literal


PUBLIC_READ = "blog.article.read_public"


class AuthorizationDenied(PermissionError):
    pass


@dataclass(frozen=True)
class Principal:
    kind: Literal["anonymous", "user", "service"] = "anonymous"
    user_id: int | None = None
    session_family: str | None = None
    authenticated_at: int | None = None
    request_id: str | None = None
    roles: tuple[str, ...] = ()


@dataclass(frozen=True)
class TargetContext:
    app_id: str = "sun-world"
    resource_type: str = "blog.article"


class PublicReadPolicy:
    """Phase A grants public reads only; roles never imply write capabilities."""

    def require(self, principal: Principal, capability: str, target: TargetContext) -> None:
        if (
            capability != PUBLIC_READ
            or target != TargetContext()
            or principal.kind not in {"anonymous", "user"}
        ):
            raise AuthorizationDenied("Capability or target is not allowed")
