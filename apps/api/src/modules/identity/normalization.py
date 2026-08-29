from __future__ import annotations

import re

from pydantic import EmailStr, TypeAdapter, ValidationError

from .errors import IdentityDomainError


EMAIL_ADAPTER = TypeAdapter(EmailStr)
PHONE_SEPARATORS = re.compile(r"[\s()\-.]")


def normalize_email(value: str) -> str:
    candidate = str(value or "").strip().lower()
    try:
        return str(EMAIL_ADAPTER.validate_python(candidate)).lower()
    except ValidationError as exc:
        raise IdentityDomainError(
            "AUTH_CONTACT_INVALID",
            "请输入有效的邮箱地址。",
            status_code=422,
        ) from exc


def normalize_phone(value: str) -> str:
    """Normalize supported phone input to an E.164-shaped value.

    Chinese mainland mobile numbers may be entered without +86. Other regions
    must provide an explicit country calling code. This intentionally avoids
    guessing a country for ambiguous local numbers.
    """
    candidate = PHONE_SEPARATORS.sub("", str(value or "").strip())
    if candidate.startswith("00"):
        candidate = f"+{candidate[2:]}"
    if re.fullmatch(r"1[3-9]\d{9}", candidate):
        candidate = f"+86{candidate}"
    if not re.fullmatch(r"\+[1-9]\d{7,14}", candidate):
        raise IdentityDomainError(
            "AUTH_CONTACT_INVALID",
            "请输入带国家区号的有效手机号。",
            status_code=422,
        )
    return candidate


def normalize_contact(kind: str, value: str) -> str:
    if kind == "phone":
        return normalize_phone(value)
    if kind == "email":
        return normalize_email(value)
    raise IdentityDomainError(
        "AUTH_CONTACT_INVALID",
        "不支持的登录联系方式。",
        status_code=422,
    )


def mask_contact(kind: str, value: str) -> str:
    if kind == "phone":
        if len(value) <= 7:
            return "***"
        return f"{value[:3]}****{value[-4:]}"
    local, separator, domain = value.partition("@")
    if not separator:
        return "***"
    visible = local[:1]
    return f"{visible}***@{domain}"
