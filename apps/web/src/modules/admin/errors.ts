import {
  isErrorCodeInNamespace,
  resolveErrorMessage,
} from '@/shared/errors/error-codes'

export function isAdminErrorCode(code: unknown): code is string {
  return isErrorCodeInNamespace(code, 'ADMIN')
}

export function getAdminErrorMessage(error: unknown): string {
  const message = resolveErrorMessage(error, {
    namespace: 'ADMIN',
    fallback: '后台数据加载失败，请稍后重试。',
  })
  const requestId =
    typeof error === 'object' && error !== null && 'requestId' in error
      ? String((error as { requestId?: unknown }).requestId || '')
      : ''
  return requestId ? `${message}（请求 ID: ${requestId}）` : message
}
