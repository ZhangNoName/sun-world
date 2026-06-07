import {
  isErrorCodeInNamespace,
  resolveErrorMessage,
} from '@/shared/errors/error-codes'

export function isAdminErrorCode(code: unknown): code is string {
  return isErrorCodeInNamespace(code, 'ADMIN')
}

export function getAdminErrorMessage(error: unknown): string {
  return resolveErrorMessage(error, {
    namespace: 'ADMIN',
    fallback: '后台数据加载失败，请稍后重试。',
  })
}
