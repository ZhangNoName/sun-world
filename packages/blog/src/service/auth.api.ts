import { TokenType } from '@/type'
import { request, ResponseType } from './http'

// 登录
export const login = async (params: {
  username: string
  password: string
  deviceId: string
}): Promise<TokenType> => {
  const response = await request.post<TokenType>('/auth/login', {
    ...params,
    device_id: params.deviceId,
  })
  return response
}

// 注册
export const register = async (
  username: string,
  password: string,
  nickname: string,
  email?: string,
  phone?: string
): Promise<boolean> => {
  const response = await request.post<boolean>('/auth/register', {
    username,
    password,
    nickname,
    email,
    phone,
  })
  return response
}

// 忘记密码（发送重置邮件或短信）
export const forgotPassword = async (
  usernameOrEmail: string,
  newPassword: string
): Promise<boolean> => {
  const response = await request.post<boolean>('/auth/forgot_password', {
    username_or_email: usernameOrEmail,
    new_password: newPassword,
  })
  return response
}

// 刷新 token
export const refreshToken = async (
  refreshToken: string
): Promise<TokenType> => {
  const response = await request.post<TokenType>(
    '/auth/refresh_token',
    {},
    {
      headers: {
        'Refresh-Token': refreshToken, // 前端从 localStorage 或 cookie 获取
      },
    }
  )
  return response
}

// 退出登录
export const logout = async (): Promise<boolean> => {
  const response = await request.post<boolean>('/auth/logout', {})
  return response
}
