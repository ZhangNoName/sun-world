from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ContactKind = Literal["phone", "email"]
OAuthProviderName = Literal["google", "qq", "wechat"]
OAuthFlow = Literal["login", "connect"]


class AuthMethodDescriptor(BaseModel):
    id: str
    kind: Literal["password", "verification_code", "oauth"]
    label: str
    enabled: bool
    reason: str | None = None


class VerificationRequest(BaseModel):
    channel: ContactKind
    target: str = Field(min_length=3, max_length=320)


class VerificationChallenge(BaseModel):
    challenge_id: str
    channel: ContactKind
    target_hint: str
    expires_in: int
    resend_after: int


class VerificationCompleteRequest(BaseModel):
    challenge_id: str = Field(min_length=20, max_length=160)
    code: str = Field(pattern=r"^\d{6}$")


class IdentitySession(BaseModel):
    user_id: int
    account_created: bool
    linked_by: Literal["identity", "verified_phone", "verified_email", "new_account"]
    provider: str
    access_token_expire: datetime
    refresh_token_expire: datetime


class OAuthStart(BaseModel):
    provider: OAuthProviderName
    flow: OAuthFlow = "login"
    authorization_url: str


class ExternalIdentityKey(BaseModel):
    """A provider-scoped legacy key that may identify the same external user."""

    issuer: str = Field(min_length=1, max_length=255)
    subject: str = Field(min_length=1, max_length=255)


class ExternalIdentityProfile(BaseModel):
    provider: OAuthProviderName
    issuer: str = Field(min_length=1, max_length=255)
    subject: str = Field(min_length=1, max_length=255)
    display_name: str = Field(default="Sun World User", min_length=1, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=2048)
    email: str | None = Field(default=None, max_length=320)
    email_verified: bool = False
    phone: str | None = Field(default=None, max_length=64)
    phone_verified: bool = False
    legacy_identity_keys: list[ExternalIdentityKey] = Field(
        default_factory=list,
        max_length=4,
    )

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        return normalized or "Sun World User"


class IdentityResolution(BaseModel):
    user_id: int
    account_created: bool
    linked_by: Literal["identity", "verified_phone", "verified_email", "new_account"]


class LinkedIdentity(BaseModel):
    id: str
    provider: str
    display_name: str | None = None
    avatar_url: str | None = None
    linked_at: datetime
    last_authenticated_at: datetime


class VerifiedContact(BaseModel):
    id: str
    kind: ContactKind
    value_hint: str
    verification_source: str
    verified_at: datetime


class AccountConnections(BaseModel):
    identities: list[LinkedIdentity] = Field(default_factory=list)
    contacts: list[VerifiedContact] = Field(default_factory=list)
