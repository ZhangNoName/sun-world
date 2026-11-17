import { API_ROUTES, CAPABILITY_KEYS } from '@sun-world/contracts'
import { apiGet, apiPost, request } from '@/shared/api'
import type { AxiosRequestConfig } from 'axios'
import type {
  AuthSession,
  CapabilityProjection,
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

export function validateCapabilityProjection(
  value: unknown
): CapabilityProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('能力快照格式无效')
  const record = value as Record<string, unknown>
  const keys = [
    'app_id',
    'account_id',
    'session_ref',
    'capabilities',
    'max_age_seconds',
  ]
  const account = record.account_id
  const reference = record.session_ref
  const grants = record.capabilities
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key)) ||
    record.app_id !== 'sun-world' ||
    !(
      account === null ||
      (typeof account === 'string' &&
        /^[1-9][0-9]{0,18}$/.test(account) &&
        !/[^0-9]/.test(account) &&
        BigInt(account) <= 9223372036854775807n)
    ) ||
    !(
      reference === null ||
      (typeof reference === 'string' &&
        reference.length === 64 &&
        /^[0-9a-f]{64}$/.test(reference))
    ) ||
    (account === null) !== (reference === null) ||
    !Array.isArray(grants) ||
    grants.length > CAPABILITY_KEYS.length ||
    grants.some(
      (key, index) =>
        typeof key !== 'string' ||
        !(CAPABILITY_KEYS as readonly string[]).includes(key) ||
        (index > 0 && grants[index - 1] >= key)
    ) ||
    (account === null &&
      grants.some((key) => key !== 'blog.article.read_public')) ||
    !Number.isInteger(record.max_age_seconds) ||
    typeof record.max_age_seconds !== 'number' ||
    record.max_age_seconds < 0 ||
    record.max_age_seconds > 15
  )
    throw new Error('能力快照格式无效')
  return record as CapabilityProjection
}

export async function getCapabilityProjection(
  signal: AbortSignal
): Promise<CapabilityProjection> {
  const projection = await apiGet(API_ROUTES.auth.capabilities, {
    config: {
      signal,
      suppressErrorToast: true,
      skipAuthPreflight: true,
      _authRetry: true,
    },
  })
  return validateCapabilityProjection(projection)
}

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
