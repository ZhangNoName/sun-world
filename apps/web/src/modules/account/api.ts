import { API_ROUTES } from '@sun-world/contracts'
import { apiGet, apiPost, request } from '@/shared/api'
import type { AxiosRequestConfig } from 'axios'
import type {
  AuthSession,
  AccountConnections,
  AuthMethod,
  IdentitySession,
  LoginParams,
  LogoutResult,
  RefreshSession,
  RegisterParams,
  RegisterSession,
  ResetPasswordParams,
  ResetPasswordRequestParams,
  OAuthStart,
  OAuthProvider,
  UserInfo,
  VerificationChallenge,
  ConnectionVerificationRequestParams,
  VerificationCompleteParams,
  VerificationRequestParams,
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

export function refreshToken(
  config?: AxiosRequestConfig
): Promise<RefreshSession> {
  return apiPost(API_ROUTES.auth.refreshToken, undefined, {
    config,
  })
}

export function getSessionStatus(
  config?: AxiosRequestConfig
): Promise<AuthSession> {
  return apiGet(API_ROUTES.auth.session, { config })
}

export function getCurrentUser(config?: AxiosRequestConfig): Promise<UserInfo> {
  return apiGet(API_ROUTES.user.me, { config })
}

export function requestResetPassword(
  data: ResetPasswordRequestParams
): Promise<null> {
  return apiPost(API_ROUTES.auth.resetPasswordRequest, data)
}

export function resetPassword(data: ResetPasswordParams): Promise<null> {
  return apiPost(API_ROUTES.auth.resetPassword, data)
}

export function getAuthMethods(): Promise<AuthMethod[]> {
  return apiGet(API_ROUTES.auth.methods, {
    config: { suppressErrorToast: true },
  })
}

export function requestVerificationCode(
  data: VerificationRequestParams
): Promise<VerificationChallenge> {
  return apiPost(API_ROUTES.auth.verificationRequest, data)
}

export function requestConnectionVerificationCode(
  data: ConnectionVerificationRequestParams
): Promise<VerificationChallenge> {
  return request.post<VerificationChallenge>(
    API_ROUTES.auth.connectionVerificationRequest,
    data,
    { suppressErrorToast: true }
  )
}

export function completeVerificationLogin(
  data: VerificationCompleteParams
): Promise<IdentitySession> {
  return apiPost(API_ROUTES.auth.verificationComplete, data)
}

export function startOAuthLogin(
  provider: OAuthProvider,
  returnTo: string
): Promise<OAuthStart> {
  return apiGet(API_ROUTES.auth.oauthStart, {
    path: { provider },
    query: { return_to: returnTo },
  })
}

export function startOAuthConnect(
  provider: OAuthProvider,
  returnTo: string
): Promise<OAuthStart> {
  const query = { return_to: returnTo, flow: 'connect' as const }
  return apiGet(API_ROUTES.auth.oauthStart, {
    path: { provider },
    query,
    config: { suppressErrorToast: true },
  })
}

export function getAccountConnections(): Promise<AccountConnections> {
  return apiGet(API_ROUTES.auth.connections)
}

export function completeConnectionVerification(
  data: VerificationCompleteParams
): Promise<AccountConnections> {
  return apiPost(API_ROUTES.auth.connectionVerificationComplete, data, {
    config: { suppressErrorToast: true },
  })
}
