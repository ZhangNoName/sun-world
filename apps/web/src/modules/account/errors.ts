import { ApiError } from '@/service/http'
import {
  AUTH_FORBIDDEN,
  AUTH_LOGIN_FAILED,
  AUTH_REGISTER_CONFLICT,
  AUTH_TOKEN_EXPIRED,
  AUTH_UNAUTHORIZED,
} from '@/shared/errors/error-codes'

const ACCOUNT_ERROR_CODES = new Set<string>([
  AUTH_UNAUTHORIZED,
  AUTH_TOKEN_EXPIRED,
  AUTH_FORBIDDEN,
  AUTH_LOGIN_FAILED,
  AUTH_REGISTER_CONFLICT,
])

export function isAccountErrorCode(code: unknown): code is string {
  return typeof code === 'string' && ACCOUNT_ERROR_CODES.has(code)
}

export function getAccountErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (String(error.code)) {
      case AUTH_LOGIN_FAILED:
        return error.msg || '账号或密码错误。'
      case AUTH_REGISTER_CONFLICT:
        return error.msg || '注册失败，账号信息可能已存在。'
      case AUTH_TOKEN_EXPIRED:
        return error.msg || '登录状态已过期，请重新登录。'
      case AUTH_UNAUTHORIZED:
        return error.msg || '请先登录后再继续操作。'
      case AUTH_FORBIDDEN:
        return error.msg || '当前账号没有权限执行该操作。'
      default:
        return error.msg || '账号操作失败，请稍后重试。'
    }
  }

  if (error instanceof Error) {
    return error.message || '账号操作失败，请稍后重试。'
  }

  return '账号操作失败，请稍后重试。'
}
