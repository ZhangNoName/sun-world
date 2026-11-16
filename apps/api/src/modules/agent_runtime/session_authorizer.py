"""Volatile verified-session bindings and a server-configured read-only policy.

These adapters do not log in, reconstruct identity from ledger hashes, cache
allow results, open database connections or grant write capabilities. The gateway
still enforces run status, deadline/lease, service credentials and tool audience.
"""

import hashlib
import hmac
import math
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from threading import RLock
from uuid import UUID

from src.core.auth import AuthorizationDenied, Principal
from src.core.auth.session import SessionAuthenticator
from .ledger import family_hash


def _denied():
    return AuthorizationDenied("Active run session required")


def _require_current_uow(uow):
    if getattr(uow, 'isolation_level', None) != 'READ COMMITTED':
        raise _denied()


def _row_context(row):
    if (not isinstance(row, dict) or not isinstance(row.get('id'), str)
            or str(UUID(row['id'])) != row['id']
            or type(row.get('user_id')) is not int or row['user_id'] <= 0
            or not isinstance(row.get('session_family_hash'), str)
            or not re.fullmatch('[0-9a-f]{64}', row['session_family_hash'])
            or not isinstance(row.get('deadline'), datetime)):
        raise _denied()
    return row['id'], row['user_id'], row['session_family_hash'], row['deadline']


def _match(principal, user_id, expected_family):
    if (not isinstance(principal, Principal) or principal.user_id != user_id
            or not hmac.compare_digest(family_hash(principal), expected_family)):
        raise _denied()


@dataclass(repr=False)
class _Binding:
    user_id: int
    family_hash: str
    deadline: datetime
    reference: str
    expires_at: float
    token: str = field(repr=False)


class RunSessionAuthorizer:
    def __init__(self, auth_manager, *, capacity=128, ttl=60, clock=time.monotonic):
        if (type(capacity) is not int or not 1 <= capacity <= 128
                or type(ttl) not in (int, float) or not math.isfinite(ttl) or not 0 < ttl <= 60
                or not callable(clock)):
            raise ValueError('Invalid run-session cache configuration')
        self._authenticator = SessionAuthenticator(auth_manager)
        self._capacity, self._ttl, self._clock = capacity, ttl, clock
        self._bindings = {}
        self._lock = RLock()
        self._closed = False

    def _now(self):
        value = self._clock()
        if type(value) not in (int, float) or not math.isfinite(value):
            raise _denied()
        return value

    def _prune(self, now):
        for key, binding in list(self._bindings.items()):
            if binding.expires_at <= now:
                self._bindings.pop(key, None)

    def bind(self, row, access_token):
        """Called only by the trusted admission path with a real access token.

        Rebinding an existing entry can replace its token but keeps its original
        expiry and deadline. No auto-bind fallback exists when authorization
        later finds an expired or missing entry (including after API restart).
        """
        try:
            run_id, user_id, family, deadline = _row_context(row)
            principal = self._authenticator.authenticate(access_token)
            _match(principal, user_id, family)
            reference = hashlib.sha256(f'{user_id}:{principal.session_family}'.encode()).hexdigest()
            with self._lock:
                now = self._now()
                if self._closed:
                    raise _denied()
                existing = self._bindings.get(run_id)
                if existing:
                    if (existing.expires_at <= now or existing.user_id != user_id
                            or existing.family_hash != family or existing.deadline != deadline):
                        raise _denied()
                    existing.token = access_token
                    return
                self._prune(now)
                if len(self._bindings) >= self._capacity:
                    raise _denied()
                self._bindings[run_id] = _Binding(user_id, family, deadline, reference,
                                                  now + self._ttl, access_token)
        except Exception:
            raise _denied() from None

    def __call__(self, uow, row):
        try:
            _require_current_uow(uow)
            run_id, user_id, family, deadline = _row_context(row)
            with self._lock:
                now = self._now()
                self._prune(now)
                binding = self._bindings.get(run_id)
                if (self._closed or binding is None or binding.user_id != user_id
                        or binding.family_hash != family or binding.deadline != deadline):
                    raise _denied()
                token, reference = binding.token, binding.reference
            principal, current = self._authenticator.revalidate_bound_session(token, reference, uow=uow)
            _match(principal, user_id, family)
            with self._lock:
                # A concurrent revoke/close may not be undone by a late lookup.
                self._prune(self._now())
                if (self._closed or self._bindings.get(run_id) is not binding):
                    raise _denied()
                binding.token = current
            return principal
        except Exception:
            raise _denied() from None

    def revoke(self, run_id):
        with self._lock:
            self._bindings.pop(run_id, None)

    def close(self):
        with self._lock:
            self._closed = True
            self._bindings.clear()


class RunAllowlistPolicy:
    def __init__(self, user_ids, *, require_admin=True):
        if (not isinstance(user_ids, (list, tuple, set, frozenset)) or not user_ids
                or any(type(value) is not int or value <= 0 for value in user_ids)
                or type(require_admin) is not bool):
            raise ValueError('Invalid run allowlist configuration')
        self._user_ids = frozenset(user_ids)
        self._require_admin = require_admin

    def __call__(self, principal, row, uow):
        try:
            _require_current_uow(uow)
            _, user_id, family, _ = _row_context(row)
            _match(principal, user_id, family)
            if (row.get('app_id') != 'sun-world' or row.get('scenario') != 'blog-qa'
                    or not isinstance(principal.roles, tuple)
                    or any(not isinstance(role, str) for role in principal.roles)
                    or user_id not in self._user_ids
                    or (self._require_admin and 'admin' not in principal.roles)):
                raise _denied()
            return True
        except Exception:
            raise _denied() from None
