import { request } from '@/service/http'
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
  return request.post<AuthSession>('/auth/login', data)
}

export function register(data: RegisterParams): Promise<RegisterSession> {
  return request.post<RegisterSession>('/auth/register', data)
}

export function logout(): Promise<LogoutResult> {
  return request.post<LogoutResult>('/auth/logout')
}

export function refreshToken(): Promise<RefreshSession> {
  return request.post<RefreshSession>('/auth/refresh_token', {})
}

export function getCurrentUser(): Promise<UserInfo> {
  return request.get<UserInfo>('/user/me')
}

export function requestResetPassword(
  data: ResetPasswordRequestParams
): Promise<null> {
  return request.post<null>('/auth/reset_password/request', data)
}

export function resetPassword(data: ResetPasswordParams): Promise<null> {
  return request.post<null>('/auth/reset_password', data)
}
