import type { components, operations } from '@sun-world/contracts'

type LoginOperation =
  operations['login_auth_login_post']['responses'][200]['content']['application/json']
type RegisterOperation =
  operations['register_auth_register_post']['responses'][200]['content']['application/json']
type RefreshOperation =
  operations['refresh_token_auth_refresh_token_post']['responses'][200]['content']['application/json']
type LogoutOperation =
  operations['logout_auth_logout_post']['responses'][200]['content']['application/json']
type MeOperation =
  operations['get_current_user_info_user_me_get']['responses'][200]['content']['application/json']

type ApiEnvelope<T> = {
  code: number | string
  data: T | null
  msg: string
}

export type LoginParams =
  operations['login_auth_login_post']['requestBody']['content']['application/json']

export type RegisterParams =
  operations['register_auth_register_post']['requestBody']['content']['application/json']

export type ResetPasswordRequestParams =
  operations['request_reset_password_auth_reset_password_request_post']['requestBody']['content']['application/json']

export type ResetPasswordParams =
  operations['reset_password_auth_reset_password_post']['requestBody']['content']['application/json']

export type AuthSession =
  LoginOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['AuthSession']

export type RegisterSession =
  RegisterOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : AuthSession

export type RefreshSession =
  RefreshOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : AuthSession

export type LogoutResult =
  LogoutOperation extends ApiEnvelope<infer T> ? T : null

export type UserInfo =
  MeOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['UserPublic']
