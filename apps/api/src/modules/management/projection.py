"""Short-lived display predicates; never a credential or write authorization."""

import hashlib
import math
import time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.auth import (
    AuthorizationDenied, AuthorizationUnavailable, Principal, PUBLIC_READ,
    PublicReadPolicy, TargetContext,
)
from src.core.auth.recent import step_up_max_age_seconds
from src.core.auth.session import SessionAuthenticator
from .policy import (
    CAPABILITIES, ManagementPolicy, ManagementDenied, ManagementLoginRequired,
    ManagementUnavailable,
)


PROJECTION_KEYS = tuple(sorted((PUBLIC_READ, *CAPABILITIES.values())))
CapabilityKey = Literal[PROJECTION_KEYS]


class CapabilityProjection(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    app_id: Literal['sun-world'] = 'sun-world'
    account_id: Annotated[str, Field(pattern=r'^[1-9][0-9]*$', max_length=19)] | None
    session_ref: Annotated[str, Field(pattern=r'^[0-9a-f]{64}$', min_length=64, max_length=64)] | None
    capabilities: Annotated[list[CapabilityKey], Field(max_length=len(PROJECTION_KEYS))]
    max_age_seconds: Annotated[int, Field(ge=0, le=15)]

    @field_validator('capabilities')
    @classmethod
    def ordered_unique(cls, values):
        if values != sorted(set(values)):
            raise ValueError('Invalid capability ordering')
        return values

    @model_validator(mode='after')
    def coherent_identity(self):
        if (self.account_id is None) != (self.session_ref is None):
            raise ValueError('Invalid projection identity')
        if self.account_id is None and any(key != PUBLIC_READ for key in self.capabilities):
            raise ValueError('Invalid anonymous capabilities')
        return self


class CapabilityProjectionService:
    def __init__(self, auth_manager=None, *, clock=time.time):
        self.auth = auth_manager
        self.clock = clock

    def project(self, access_token=None):
        # Import the explicit composition only at call time to avoid cycles.
        from src.module_composition import create_module_registry
        principal = Principal()
        age = 15
        try:
            if create_module_registry().capabilities != frozenset(PROJECTION_KEYS):
                raise ManagementUnavailable()
            now = self.clock()
            if type(now) not in (int, float) or not math.isfinite(now):
                raise ManagementUnavailable()
            if access_token is not None:
                if type(access_token) is not str or not 0 < len(access_token) <= 4096:
                    raise ManagementLoginRequired()
                with self.auth.user_manager.db.unit_of_work(isolation_level='READ COMMITTED') as uow:
                    principal = SessionAuthenticator(self.auth).authenticate(access_token, uow=uow)
                    if (type(principal.user_id) is not int or not 0 < principal.user_id <= 9_223_372_036_854_775_807
                            or type(principal.session_family) is not str
                            or not principal.session_family.strip() or len(principal.session_family) > 128):
                        raise ManagementLoginRequired()
                    expiry = self.auth.get_token_expiry(access_token, 'access', check_redis=True)
                    if expiry is None:
                        raise ManagementLoginRequired()
                    now = self.clock()
                    if type(now) not in (int, float) or not math.isfinite(now):
                        raise ManagementUnavailable()
                    age = max(0, min(15, math.floor(expiry.timestamp() - now)))
            PublicReadPolicy().require(principal, PUBLIC_READ, TargetContext())
            keys = [PUBLIC_READ]
            if principal.kind == 'user':
                max_age = step_up_max_age_seconds()
                try:
                    ManagementPolicy().require_actor(principal, now=now, max_age=max_age)
                except ManagementDenied:
                    pass
                else:
                    keys.extend(CAPABILITIES.values())
                    age = max(0, min(age, math.floor(principal.authenticated_at + max_age - now)))
            return CapabilityProjection(account_id=str(principal.user_id) if principal.kind == 'user' else None,
                session_ref=hashlib.sha256(f'{principal.user_id}:{principal.session_family}'.encode()).hexdigest()
                if principal.kind == 'user' else None,
                capabilities=sorted(keys), max_age_seconds=age)
        except AuthorizationUnavailable:
            raise ManagementUnavailable() from None
        except AuthorizationDenied:
            raise ManagementLoginRequired() from None
        except Exception:
            raise ManagementUnavailable() from None
