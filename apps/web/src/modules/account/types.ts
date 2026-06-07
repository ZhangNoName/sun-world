import type {
  ApiRequestBody,
  ApiSuccessData,
  components,
} from '@sun-world/contracts'

export type LoginParams =
  ApiRequestBody<'/auth/login', 'post'>

export type RegisterParams =
  ApiRequestBody<'/auth/register', 'post'>

export type ResetPasswordRequestParams =
  ApiRequestBody<'/auth/reset_password/request', 'post'>

export type ResetPasswordParams =
  ApiRequestBody<'/auth/reset_password', 'post'>

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
