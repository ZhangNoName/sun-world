import type { TokenType } from '@/type'
import {
  login,
  logout,
  refreshToken,
  register,
  resetPassword,
  type LoginParams,
  type RegisterParams,
  type ResetPasswordParams,
} from '@/modules/account'

export const postRegister = async (
  data: RegisterParams
): Promise<TokenType> => {
  const response = await register(data)
  return response
}

export const postLogin = async (data: LoginParams): Promise<TokenType> => {
  const response = await login(data)
  return response
}

export const postLogout = async (): Promise<null> => {
  const response = await logout()
  return response
}

export const postRefreshToken = async (): Promise<TokenType> => {
  const response = await refreshToken()
  return response
}

export const postResetPassword = async (
  data: ResetPasswordParams
): Promise<null> => {
  const response = await resetPassword(data)
  return response
}
