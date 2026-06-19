/**
 * Stable frontend error-code registry.
 *
 * Mirrors backend definitions in `apps/api/src/core/error_codes.py`.
 * Use these constants and helpers in error-handling logic instead of hard-coded
 * numeric values or scattered switch statements.
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

export type ErrorNamespace =
  | 'COMMON'
  | 'AUTH'
  | 'BLOG'
  | 'AI'
  | 'FILE'
  | 'EDITOR'
  | 'ADMIN'

export type ErrorSeverity = 'info' | 'warning' | 'error'

export interface ErrorCodeDetail {
  code: string
  namespace: ErrorNamespace
  title: string
  defaultMessage: string
  severity: ErrorSeverity
  retryable: boolean
}

export const ERROR_CODE_DETAILS = {
  [COMMON_BAD_REQUEST]: {
    code: COMMON_BAD_REQUEST,
    namespace: 'COMMON',
    title: 'Bad request',
    defaultMessage: '请求参数有误，请检查后重试。',
    severity: 'warning',
    retryable: false,
  },
  [COMMON_VALIDATION_ERROR]: {
    code: COMMON_VALIDATION_ERROR,
    namespace: 'COMMON',
    title: 'Validation error',
    defaultMessage: '参数校验失败，请检查输入内容。',
    severity: 'warning',
    retryable: false,
  },
  [COMMON_NOT_FOUND]: {
    code: COMMON_NOT_FOUND,
    namespace: 'COMMON',
    title: 'Not found',
    defaultMessage: '资源不存在或已被移除。',
    severity: 'warning',
    retryable: false,
  },
  [COMMON_INTERNAL_ERROR]: {
    code: COMMON_INTERNAL_ERROR,
    namespace: 'COMMON',
    title: 'Internal error',
    defaultMessage: '服务暂时不可用，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [COMMON_RATE_LIMITED]: {
    code: COMMON_RATE_LIMITED,
    namespace: 'COMMON',
    title: 'Rate limited',
    defaultMessage: '操作过于频繁，请稍后再试。',
    severity: 'warning',
    retryable: true,
  },
  [AUTH_UNAUTHORIZED]: {
    code: AUTH_UNAUTHORIZED,
    namespace: 'AUTH',
    title: 'Unauthorized',
    defaultMessage: '请先登录后再继续操作。',
    severity: 'warning',
    retryable: false,
  },
  [AUTH_TOKEN_EXPIRED]: {
    code: AUTH_TOKEN_EXPIRED,
    namespace: 'AUTH',
    title: 'Token expired',
    defaultMessage: '登录状态已过期，请重新登录。',
    severity: 'warning',
    retryable: false,
  },
  [AUTH_FORBIDDEN]: {
    code: AUTH_FORBIDDEN,
    namespace: 'AUTH',
    title: 'Forbidden',
    defaultMessage: '当前账号没有权限执行该操作。',
    severity: 'warning',
    retryable: false,
  },
  [AUTH_LOGIN_FAILED]: {
    code: AUTH_LOGIN_FAILED,
    namespace: 'AUTH',
    title: 'Login failed',
    defaultMessage: '账号或密码错误。',
    severity: 'warning',
    retryable: false,
  },
  [AUTH_REGISTER_CONFLICT]: {
    code: AUTH_REGISTER_CONFLICT,
    namespace: 'AUTH',
    title: 'Register conflict',
    defaultMessage: '注册失败，账号信息可能已存在。',
    severity: 'warning',
    retryable: false,
  },
  [BLOG_NOT_FOUND]: {
    code: BLOG_NOT_FOUND,
    namespace: 'BLOG',
    title: 'Blog not found',
    defaultMessage: '文章未找到，可能已被删除或链接无效。',
    severity: 'warning',
    retryable: false,
  },
  [BLOG_CREATE_FAILED]: {
    code: BLOG_CREATE_FAILED,
    namespace: 'BLOG',
    title: 'Blog create failed',
    defaultMessage: '文章保存失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [BLOG_UPDATE_FAILED]: {
    code: BLOG_UPDATE_FAILED,
    namespace: 'BLOG',
    title: 'Blog update failed',
    defaultMessage: '文章更新失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [BLOG_DELETE_FAILED]: {
    code: BLOG_DELETE_FAILED,
    namespace: 'BLOG',
    title: 'Blog delete failed',
    defaultMessage: '文章删除失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [AI_REQUEST_FAILED]: {
    code: AI_REQUEST_FAILED,
    namespace: 'AI',
    title: 'AI request failed',
    defaultMessage: 'AI 请求失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [AI_RATE_LIMITED]: {
    code: AI_RATE_LIMITED,
    namespace: 'AI',
    title: 'AI rate limited',
    defaultMessage: 'AI 请求过于频繁，请稍后再试。',
    severity: 'warning',
    retryable: true,
  },
  [AI_MODEL_UNAVAILABLE]: {
    code: AI_MODEL_UNAVAILABLE,
    namespace: 'AI',
    title: 'AI model unavailable',
    defaultMessage: '当前 AI 模型暂时不可用。',
    severity: 'error',
    retryable: true,
  },
  [FILE_UPLOAD_FAILED]: {
    code: FILE_UPLOAD_FAILED,
    namespace: 'FILE',
    title: 'File upload failed',
    defaultMessage: '文件上传失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [FILE_TOO_LARGE]: {
    code: FILE_TOO_LARGE,
    namespace: 'FILE',
    title: 'File too large',
    defaultMessage: '文件过大，请压缩后再上传。',
    severity: 'warning',
    retryable: false,
  },
  [FILE_TYPE_UNSUPPORTED]: {
    code: FILE_TYPE_UNSUPPORTED,
    namespace: 'FILE',
    title: 'Unsupported file type',
    defaultMessage: '暂不支持该文件类型。',
    severity: 'warning',
    retryable: false,
  },
  [FILE_NOT_FOUND]: {
    code: FILE_NOT_FOUND,
    namespace: 'FILE',
    title: 'File not found',
    defaultMessage: '文件不存在或已被移除。',
    severity: 'warning',
    retryable: false,
  },
  [EDITOR_SAVE_FAILED]: {
    code: EDITOR_SAVE_FAILED,
    namespace: 'EDITOR',
    title: 'Editor save failed',
    defaultMessage: '编辑内容保存失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
  [EDITOR_LOAD_FAILED]: {
    code: EDITOR_LOAD_FAILED,
    namespace: 'EDITOR',
    title: 'Editor load failed',
    defaultMessage: '编辑内容加载失败，请刷新后重试。',
    severity: 'error',
    retryable: true,
  },
  [ADMIN_ACCESS_DENIED]: {
    code: ADMIN_ACCESS_DENIED,
    namespace: 'ADMIN',
    title: 'Admin access denied',
    defaultMessage: '当前账号没有管理权限。',
    severity: 'warning',
    retryable: false,
  },
  [ADMIN_OPERATION_FAILED]: {
    code: ADMIN_OPERATION_FAILED,
    namespace: 'ADMIN',
    title: 'Admin operation failed',
    defaultMessage: '管理操作失败，请稍后重试。',
    severity: 'error',
    retryable: true,
  },
} as const satisfies Record<string, ErrorCodeDetail>

export type ErrorCode = keyof typeof ERROR_CODE_DETAILS

export interface ErrorLike {
  code?: unknown
  msg?: unknown
  message?: unknown
}

export interface ResolveErrorMessageOptions {
  namespace?: ErrorNamespace
  fallback?: string
  messages?: Partial<Record<ErrorCode, string>>
  preferBackendMessage?: boolean
}

export function isKnownErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && code in ERROR_CODE_DETAILS
}

export function getErrorCodeDetail(code: unknown): ErrorCodeDetail | undefined {
  return isKnownErrorCode(code) ? ERROR_CODE_DETAILS[code] : undefined
}

export function isErrorCodeInNamespace(
  code: unknown,
  namespace: ErrorNamespace
): code is ErrorCode {
  const detail = getErrorCodeDetail(code)
  return detail?.namespace === namespace
}

export function getErrorNamespace(code: unknown): ErrorNamespace | undefined {
  return getErrorCodeDetail(code)?.namespace
}

export function getErrorSeverity(code: unknown): ErrorSeverity {
  return getErrorCodeDetail(code)?.severity ?? 'error'
}

export function isRetryableErrorCode(code: unknown): boolean {
  return getErrorCodeDetail(code)?.retryable ?? false
}

export function getErrorLike(error: unknown): ErrorLike | undefined {
  if (error && typeof error === 'object') {
    return error as ErrorLike
  }
  return undefined
}

export function resolveErrorMessage(
  error: unknown,
  options: ResolveErrorMessageOptions = {}
): string {
  const fallback = options.fallback ?? '请求失败，请稍后重试。'
  const errorLike = getErrorLike(error)
  const code = errorLike?.code
  const detail = getErrorCodeDetail(code)
  const backendMessage = getText(errorLike?.msg) ?? getText(errorLike?.message)

  if (detail && options.namespace && detail.namespace !== options.namespace) {
    return backendMessage ?? fallback
  }

  if (detail) {
    const moduleMessage = options.messages?.[detail.code as ErrorCode]
    if (moduleMessage) {
      return moduleMessage
    }

    if (options.preferBackendMessage && backendMessage) {
      return backendMessage
    }

    return detail.defaultMessage
  }

  if (backendMessage) {
    return backendMessage
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function getText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
