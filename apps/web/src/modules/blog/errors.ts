import {
  BLOG_NOT_FOUND,
  isErrorCodeInNamespace,
  resolveErrorMessage,
} from '@/shared/errors/error-codes'

export function isBlogErrorCode(code: unknown): code is string {
  return isErrorCodeInNamespace(code, 'BLOG')
}

export function getBlogErrorMessage(error: unknown): string {
  return resolveErrorMessage(error, {
    namespace: 'BLOG',
    fallback: '博客操作失败，请稍后重试。',
    messages: {
      [BLOG_NOT_FOUND]: '文章未找到，可能已被删除或链接无效。',
    },
  })
}
