from datetime import datetime
import re

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.\-\u4e00-\u9fff]+$")
PHONE_SEPARATORS = re.compile(r"[\s()\-.]")


def normalize_username(value: object) -> str:
    """Normalize a username while keeping it outside contact namespaces."""
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError("username must not be blank")
    if len(normalized) > 64:
        raise ValueError("username must not exceed 64 characters")
    if "@" in normalized or not USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError(
            "username may only contain letters, numbers, Chinese characters, '.', '_' or '-'"
        )
    phone_candidate = PHONE_SEPARATORS.sub("", normalized)
    if phone_candidate.startswith("00"):
        phone_candidate = f"+{phone_candidate[2:]}"
    if re.fullmatch(r"1[3-9]\d{9}", phone_candidate) or re.fullmatch(
        r"\+[1-9]\d{7,14}", phone_candidate
    ):
        raise ValueError("username must not be a phone number")
    return normalized


def normalize_login_identifier(value: object) -> str:
    """Canonicalize exactly one username, email, or phone login namespace."""
    candidate = str(value or "").strip()
    if not candidate:
        raise ValueError("username must not be blank")
    from src.modules.identity.errors import IdentityDomainError
    from src.modules.identity.normalization import normalize_email, normalize_phone

    if "@" in candidate:
        try:
            return normalize_email(candidate)
        except IdentityDomainError as exc:
            raise ValueError("invalid email login identifier") from exc
    try:
        return normalize_phone(candidate)
    except IdentityDomainError:
        # Non-phone input must satisfy the deliberately narrow username
        # alphabet. Lowercasing mirrors the users table's case-insensitive
        # legacy collation and gives login throttling one stable account key.
        return normalize_username(candidate).lower()


class RegisterModel(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return normalize_username(value)


class LoginModel(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return normalize_login_identifier(value)


class TokenModel(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expire: datetime
    refresh_token_expire: datetime


class AuthSession(BaseModel):
    id: Optional[int] = None
    access_token_expire: Optional[datetime] = None
    refresh_token_expire: Optional[datetime] = None


class ResetPasswordRequest(BaseModel):
    email: EmailStr = Field(max_length=254)


class ResetPasswordModel(BaseModel):
    token: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=8, max_length=128)
