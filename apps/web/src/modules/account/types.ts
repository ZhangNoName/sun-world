import type {
  ApiRequestBody,
  ApiSuccessData,
  components,
} from '@sun-world/contracts'

export type LoginParams = ApiRequestBody<'/auth/login', 'post'>

export type RegisterParams = ApiRequestBody<'/auth/register', 'post'>

export type ResetPasswordRequestParams = ApiRequestBody<
  '/auth/reset_password/request',
  'post'
>

export type ResetPasswordParams = ApiRequestBody<'/auth/reset_password', 'post'>

export type AuthSession =
  ApiSuccessData<'/auth/login', 'post'> extends never
    ? components['schemas']['AuthSession']
    : NonNullable<ApiSuccessData<'/auth/login', 'post'>>

export type RegisterSession =
  ApiSuccessData<'/auth/register', 'post'> extends infer T
    ? NonNullable<T>
    : AuthSession

export type RefreshSession =
  ApiSuccessData<'/auth/refresh_token', 'post'> extends infer T
    ? NonNullable<T>
    : AuthSession

export type LogoutResult =
  ApiSuccessData<'/auth/logout', 'post'> extends never
    ? null
    : ApiSuccessData<'/auth/logout', 'post'>

export type UserInfo =
  ApiSuccessData<'/user/me', 'get'> extends never
    ? components['schemas']['UserPublic']
    : NonNullable<ApiSuccessData<'/user/me', 'get'>>

export type AuthMethod = components['schemas']['AuthMethodDescriptor']
export type VerificationRequestParams = ApiRequestBody<
  '/auth/verification/request',
  'post'
>
export type ConnectionVerificationRequestParams = ApiRequestBody<
  '/auth/connections/verification/request',
  'post'
>
export type VerificationChallenge = NonNullable<
  ApiSuccessData<'/auth/verification/request', 'post'>
>
export type VerificationCompleteParams = ApiRequestBody<
  '/auth/verification/complete',
  'post'
>
export type IdentitySession = NonNullable<
  ApiSuccessData<'/auth/verification/complete', 'post'>
>
export type OAuthProvider = 'google' | 'qq' | 'wechat'
export type OAuthFlow = 'login' | 'connect'
export type OAuthStart = NonNullable<
  ApiSuccessData<'/auth/oauth/{provider}/start', 'get'>
> & { flow?: OAuthFlow }
export type AccountConnections = NonNullable<
  ApiSuccessData<'/auth/connections', 'get'>
>
