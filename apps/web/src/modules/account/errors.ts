import {
  isErrorCodeInNamespace,
  resolveErrorMessage,
} from '@/shared/errors/error-codes'

const ACCOUNT_STEP_UP_ERROR_CODES = new Set([
  'AUTH_STEP_UP_REQUIRED',
  'AUTH_UNAUTHORIZED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_OAUTH_CONNECT_SESSION_CHANGED',
])

export function getAccountErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

export function isAccountStepUpError(error: unknown): boolean {
  return ACCOUNT_STEP_UP_ERROR_CODES.has(getAccountErrorCode(error))
}

export function isAccountErrorCode(code: unknown): code is string {
  return isErrorCodeInNamespace(code, 'AUTH')
}

export function getAccountErrorMessage(error: unknown): string {
  return resolveErrorMessage(error, {
    namespace: 'AUTH',
    fallback: '账号操作失败，请稍后重试。',
  })
}
