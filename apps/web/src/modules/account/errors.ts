import {
  isErrorCodeInNamespace,
  resolveErrorMessage,
} from '@/shared/errors/error-codes'

export function isAccountErrorCode(code: unknown): code is string {
  return isErrorCodeInNamespace(code, 'AUTH')
}

export function getAccountErrorMessage(error: unknown): string {
  return resolveErrorMessage(error, {
    namespace: 'AUTH',
    fallback: '账号操作失败，请稍后重试。',
  })
}
