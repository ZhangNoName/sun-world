import { request } from './http'
import type { TokenType } from '@/type'

interface RegisterParams {
  name: string
  phone: string
  email: string
  password: string
}

export const postRegister = async (
  data: RegisterParams
): Promise<TokenType> => {
  const response = await request.post<TokenType>('/auth/register', data)
  return response
}

interface LoginParams {
  username: string
  password: string
}

export const postLogin = async (data: LoginParams): Promise<TokenType> => {
  const response = await request.post<TokenType>('/auth/login', data)
  return response
}

export const postLogout = async (): Promise<boolean> => {
  const response = await request.post<boolean>('/auth/logout')
  return response
}

export const postRefreshToken = async (): Promise<TokenType> => {
  // refresh_token 从 cookie 自动带过去，不需要传参数
  const response = await request.post<TokenType>('/auth/refresh_token', {})
  return response
}

interface ResetPasswordParams {
  username_or_email: string
  new_password: string
}

export const postResetPassword = async (data: ResetPasswordParams) => {
  const response = await request.post('/auth/reset_password', data)
  return response
}
