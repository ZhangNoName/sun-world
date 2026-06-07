/**
 * Stable frontend error-code map.
 *
 * Mirrors the backend error-code definitions in `apps/api/src/core/error_codes.py`.
 * Use these constants in error-handling logic instead of hard-coded numeric values
 * so that the meaning is clear and the contract stays in sync.
 *
 * Naming convention: `<NAMESPACE>_<MEANING>` (UPPER_SNAKE_CASE).
 */

// ---- COMMON (通用) ----
export const COMMON_BAD_REQUEST = 'COMMON_BAD_REQUEST'
export const COMMON_VALIDATION_ERROR = 'COMMON_VALIDATION_ERROR'
export const COMMON_NOT_FOUND = 'COMMON_NOT_FOUND'
export const COMMON_INTERNAL_ERROR = 'COMMON_INTERNAL_ERROR'
export const COMMON_RATE_LIMITED = 'COMMON_RATE_LIMITED'

// ---- AUTH (认证/授权) ----
export const AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED'
export const AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED'
export const AUTH_FORBIDDEN = 'AUTH_FORBIDDEN'
export const AUTH_LOGIN_FAILED = 'AUTH_LOGIN_FAILED'
export const AUTH_REGISTER_CONFLICT = 'AUTH_REGISTER_CONFLICT'

// ---- BLOG (博客) ----
export const BLOG_NOT_FOUND = 'BLOG_NOT_FOUND'
export const BLOG_CREATE_FAILED = 'BLOG_CREATE_FAILED'
export const BLOG_UPDATE_FAILED = 'BLOG_UPDATE_FAILED'
export const BLOG_DELETE_FAILED = 'BLOG_DELETE_FAILED'

// ---- AI ----
export const AI_REQUEST_FAILED = 'AI_REQUEST_FAILED'
export const AI_RATE_LIMITED = 'AI_RATE_LIMITED'
export const AI_MODEL_UNAVAILABLE = 'AI_MODEL_UNAVAILABLE'

// ---- FILE (文件) ----
export const FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED'
export const FILE_TOO_LARGE = 'FILE_TOO_LARGE'
export const FILE_TYPE_UNSUPPORTED = 'FILE_TYPE_UNSUPPORTED'
export const FILE_NOT_FOUND = 'FILE_NOT_FOUND'

// ---- EDITOR (编辑器) ----
export const EDITOR_SAVE_FAILED = 'EDITOR_SAVE_FAILED'
export const EDITOR_LOAD_FAILED = 'EDITOR_LOAD_FAILED'

// ---- ADMIN (管理) ----
export const ADMIN_ACCESS_DENIED = 'ADMIN_ACCESS_DENIED'
export const ADMIN_OPERATION_FAILED = 'ADMIN_OPERATION_FAILED'
