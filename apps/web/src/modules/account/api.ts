import { API_ROUTES } from '@sun-world/contracts'
import { apiGet, apiPost } from '@/shared/api'
import type {
  AuthSession,
  LoginParams,
  LogoutResult,
  RefreshSession,
  RegisterParams,
  RegisterSession,
  ResetPasswordParams,
  ResetPasswordRequestParams,
  UserInfo,
} from './types'

export function login(data: LoginParams): Promise<AuthSession> {
  return apiPost(API_ROUTES.auth.login, data)
}

export function register(data: RegisterParams): Promise<RegisterSession> {
  return apiPost(API_ROUTES.auth.register, data)
}

export function logout(): Promise<LogoutResult> {
  return apiPost(API_ROUTES.auth.logout)
}

export function refreshToken(): Promise<RefreshSession> {
  return apiPost(API_ROUTES.auth.refreshToken)
}

export function getCurrentUser(): Promise<UserInfo> {
  return apiGet(API_ROUTES.user.me)
}

export function requestResetPassword(
  data: ResetPasswordRequestParams
): Promise<null> {
  return apiPost(API_ROUTES.auth.resetPasswordRequest, data)
}

export function resetPassword(data: ResetPasswordParams): Promise<null> {
  return apiPost(API_ROUTES.auth.resetPassword, data)
}
