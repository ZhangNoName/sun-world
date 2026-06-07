"""
Stable error-code definitions.

Every API error response carries a `code` field in the envelope
{ code, data, msg }. This module defines named constants so that
both backend and frontend can reference the same stable identifiers.

Naming convention:
    <NAMESPACE>_<MEANING>  - UPPER_SNAKE_CASE

Namespaces:
    COMMON  - cross-cutting errors (validation, not-found, internal, rate-limit)
    AUTH    - authentication and authorisation errors
    BLOG    - blog/article domain errors
    AI      - AI/LLM interaction errors
    FILE    - file upload and storage errors
    EDITOR  - canvas/editor domain errors
    ADMIN   - admin/analytics access errors

Usage:
    from src.core.error_codes import COMMON_NOT_FOUND
    return fail(msg="Resource not found", code=COMMON_NOT_FOUND)
"""

from typing import Optional

# ---------------------------------------------------------------------------
# COMMON - 通用
# ---------------------------------------------------------------------------
COMMON_BAD_REQUEST = "COMMON_BAD_REQUEST"
COMMON_VALIDATION_ERROR = "COMMON_VALIDATION_ERROR"
COMMON_NOT_FOUND = "COMMON_NOT_FOUND"
COMMON_INTERNAL_ERROR = "COMMON_INTERNAL_ERROR"
COMMON_RATE_LIMITED = "COMMON_RATE_LIMITED"

# ---------------------------------------------------------------------------
# AUTH - 认证 / 授权
# ---------------------------------------------------------------------------
AUTH_UNAUTHORIZED = "AUTH_UNAUTHORIZED"
AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
AUTH_FORBIDDEN = "AUTH_FORBIDDEN"
AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED"
AUTH_REGISTER_CONFLICT = "AUTH_REGISTER_CONFLICT"

# ---------------------------------------------------------------------------
# BLOG - 博客
# ---------------------------------------------------------------------------
BLOG_NOT_FOUND = "BLOG_NOT_FOUND"
BLOG_CREATE_FAILED = "BLOG_CREATE_FAILED"
BLOG_UPDATE_FAILED = "BLOG_UPDATE_FAILED"
BLOG_DELETE_FAILED = "BLOG_DELETE_FAILED"

# ---------------------------------------------------------------------------
# AI
# ---------------------------------------------------------------------------
AI_REQUEST_FAILED = "AI_REQUEST_FAILED"
AI_RATE_LIMITED = "AI_RATE_LIMITED"
AI_MODEL_UNAVAILABLE = "AI_MODEL_UNAVAILABLE"

# ---------------------------------------------------------------------------
# FILE - 文件
# ---------------------------------------------------------------------------
FILE_UPLOAD_FAILED = "FILE_UPLOAD_FAILED"
FILE_TOO_LARGE = "FILE_TOO_LARGE"
FILE_TYPE_UNSUPPORTED = "FILE_TYPE_UNSUPPORTED"
FILE_NOT_FOUND = "FILE_NOT_FOUND"

# ---------------------------------------------------------------------------
# EDITOR - 编辑器
# ---------------------------------------------------------------------------
EDITOR_SAVE_FAILED = "EDITOR_SAVE_FAILED"
EDITOR_LOAD_FAILED = "EDITOR_LOAD_FAILED"

# ---------------------------------------------------------------------------
# ADMIN - 管理
# ---------------------------------------------------------------------------
ADMIN_ACCESS_DENIED = "ADMIN_ACCESS_DENIED"
ADMIN_OPERATION_FAILED = "ADMIN_OPERATION_FAILED"


ERROR_CODE_NAMESPACES = {
    COMMON_BAD_REQUEST: "COMMON",
    COMMON_VALIDATION_ERROR: "COMMON",
    COMMON_NOT_FOUND: "COMMON",
    COMMON_INTERNAL_ERROR: "COMMON",
    COMMON_RATE_LIMITED: "COMMON",
    AUTH_UNAUTHORIZED: "AUTH",
    AUTH_TOKEN_EXPIRED: "AUTH",
    AUTH_FORBIDDEN: "AUTH",
    AUTH_LOGIN_FAILED: "AUTH",
    AUTH_REGISTER_CONFLICT: "AUTH",
    BLOG_NOT_FOUND: "BLOG",
    BLOG_CREATE_FAILED: "BLOG",
    BLOG_UPDATE_FAILED: "BLOG",
    BLOG_DELETE_FAILED: "BLOG",
    AI_REQUEST_FAILED: "AI",
    AI_RATE_LIMITED: "AI",
    AI_MODEL_UNAVAILABLE: "AI",
    FILE_UPLOAD_FAILED: "FILE",
    FILE_TOO_LARGE: "FILE",
    FILE_TYPE_UNSUPPORTED: "FILE",
    FILE_NOT_FOUND: "FILE",
    EDITOR_SAVE_FAILED: "EDITOR",
    EDITOR_LOAD_FAILED: "EDITOR",
    ADMIN_ACCESS_DENIED: "ADMIN",
    ADMIN_OPERATION_FAILED: "ADMIN",
}

ERROR_CODES = frozenset(ERROR_CODE_NAMESPACES.keys())


def is_known_error_code(code: object) -> bool:
    """Return True when code is a stable string error code."""
    return isinstance(code, str) and code in ERROR_CODES


def get_error_namespace(code: object) -> Optional[str]:
    """Return the namespace for a stable error code, if known."""
    return ERROR_CODE_NAMESPACES.get(code) if isinstance(code, str) else None


def is_error_code_in_namespace(code: object, namespace: str) -> bool:
    """Return True when code belongs to the requested namespace."""
    return get_error_namespace(code) == namespace
