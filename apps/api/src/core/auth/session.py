"""Adapt the existing AuthManager without creating a second session system."""

import hashlib
import hmac

from jose import jwt

from . import AuthorizationDenied, Principal


class SessionAuthenticator:
    def __init__(self, auth_manager):
        self.auth_manager = auth_manager

    def authenticate(self, access_token: str, *, request_id: str | None = None, uow=None) -> Principal:
        # Re-read Redis and current account/roles on every call. Never cache allow.
        try:
            if uow is None:
                user = self.auth_manager.get_user_from_token(access_token, check_redis=True)
            else:
                if getattr(uow, "isolation_level", None) != "READ COMMITTED":
                    raise ValueError("Current authorization requires READ COMMITTED")
                user = self.auth_manager.get_user_from_token(access_token, check_redis=True, uow=uow)
            if not user:
                raise ValueError("Inactive session")
            payload = jwt.decode(access_token, self.auth_manager.secret_key, algorithms=["HS256"])
            user_id = user["id"]
            if (
                type(user_id) is not int or user_id <= 0
                or int(payload["sub"]) != user_id
                or payload.get("typ") != "access"
                or not isinstance(payload.get("sid"), str) or not payload["sid"]
                or type(payload.get("auth_time")) is not int
            ):
                raise ValueError("Invalid session context")
            roles = tuple(sorted({
                str(role.get("code", "")).strip().lower()
                for role in user.get("roles", []) if isinstance(role, dict)
            } - {""}))
            return Principal(
                kind="user", user_id=user_id, session_family=payload["sid"],
                authenticated_at=payload["auth_time"], request_id=request_id, roles=roles,
            )
        except Exception:
            # Fail closed on dependency failure; no credential in error or log.
            raise AuthorizationDenied("Active login required") from None

    def revalidate_bound_session(self, cached_access_token: str, reference: str, *, uow=None) -> tuple[Principal, str]:
        """Refresh an already verified server-side binding from authoritative Redis.

        This is never an HTTP authentication entrypoint. The old, signed token
        only identifies the previously verified user/device/family; authorization
        always uses the current Redis token and the strict authenticate method.
        """
        try:
            payload = jwt.decode(cached_access_token, self.auth_manager.secret_key,
                                 algorithms=["HS256"], options={"verify_exp": False})
            user_id = int(payload["sub"])
            family, device = payload.get("sid"), payload.get("device")
            if (
                user_id <= 0 or payload["sub"] != str(user_id) or payload.get("typ") != "access"
                or not isinstance(family, str) or not family
                or not isinstance(device, str) or not device or len(device) > 128
                or type(payload.get("auth_time")) is not int
            ):
                raise ValueError("Invalid cached binding")
            expected = hashlib.sha256(f"{user_id}:{family}".encode()).hexdigest()
            if not isinstance(reference, str) or not hmac.compare_digest(reference, expected):
                raise ValueError("Binding mismatch")
            snapshot = self.auth_manager.db.get_session_token_snapshot(user_id=str(user_id), device_id=device)
            if not isinstance(snapshot, (tuple, list)) or len(snapshot) != 3:
                raise ValueError("Inactive bound session")
            current, refresh, current_family = snapshot
            if not current or not refresh or current_family != family:
                raise ValueError("Session family changed")
            subject = self.authenticate(current) if uow is None else self.authenticate(current, uow=uow)
            current_payload = jwt.decode(current, self.auth_manager.secret_key, algorithms=["HS256"])
            if (subject.user_id != user_id or subject.session_family != family
                    or current_payload.get("device") != device):
                raise ValueError("Successor binding mismatch")
            return subject, current
        except Exception:
            raise AuthorizationDenied("Active bound session required") from None
