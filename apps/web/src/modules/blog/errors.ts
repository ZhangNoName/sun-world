import { ApiError } from '@/service/http'
import {
  BLOG_NOT_FOUND,
  BLOG_CREATE_FAILED,
  BLOG_UPDATE_FAILED,
  BLOG_DELETE_FAILED,
} from '@/shared/errors/error-codes'

/**
 * Known blog error codes consumed by this module.
 *
 * They mirror the backend error-code contract so callers never
 * need to hard-code strings.
 */
const BLOG_ERROR_CODES = new Set<string>([
  BLOG_NOT_FOUND,
  BLOG_CREATE_FAILED,
  BLOG_UPDATE_FAILED,
  BLOG_DELETE_FAILED,
])

/**
 * Check whether a code belongs to the blog error namespace.
 */
export function isBlogErrorCode(code: unknown): code is string {
  return typeof code === 'string' && BLOG_ERROR_CODES.has(code)
}

/**
 * Human-readable error message for a blog-domain error.
 *
 * Falls back to the ApiError's own message or a generic message
 * when the error is not recognised.
 */
export function getBlogErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = String(error.code)

    switch (code) {
      case BLOG_NOT_FOUND:
        return '文章未找到，可能已被删除或链接无效。'
      case BLOG_CREATE_FAILED:
        return error.msg || '文章保存失败，请稍后重试。'
      case BLOG_UPDATE_FAILED:
        return error.msg || '文章更新失败，请稍后重试。'
      case BLOG_DELETE_FAILED:
        return error.msg || '文章删除失败，请稍后重试。'
      default:
        return error.msg || '博客操作失败，请稍后重试。'
    }
  }

  if (error instanceof Error) {
    return error.message || '博客操作失败，请稍后重试。'
  }

  return '博客操作失败，请稍后重试。'
}
