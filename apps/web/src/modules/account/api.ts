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
  return apiPost('/auth/login', data)
}

export function register(data: RegisterParams): Promise<RegisterSession> {
  return apiPost('/auth/register', data)
}

export function logout(): Promise<LogoutResult> {
  return apiPost('/auth/logout')
}

export function refreshToken(): Promise<RefreshSession> {
  return apiPost('/auth/refresh_token')
}

export function getCurrentUser(): Promise<UserInfo> {
  return apiGet('/user/me')
}

export function requestResetPassword(
  data: ResetPasswordRequestParams
): Promise<null> {
  return apiPost('/auth/reset_password/request', data)
}

export function resetPassword(data: ResetPasswordParams): Promise<null> {
  return apiPost('/auth/reset_password', data)
}
