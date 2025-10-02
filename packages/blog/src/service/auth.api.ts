import { TokenType } from '@/type'
import { request, ResponseType } from './http'

// 登录
export const login = async (
  username: string,
  password: string,
  deviceId: string
): Promise<ResponseType<TokenType>> => {
  const response = await request.post<ResponseType<TokenType>>('/auth/login', {
    username,
    password,
    device_id: deviceId,
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
): Promise<ResponseType<boolean>> => {
  const response = await request.post<ResponseType<boolean>>('/auth/register', {
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
): Promise<ResponseType<boolean>> => {
  const response = await request.post<ResponseType<boolean>>(
    '/auth/forgot_password',
    {
      username_or_email: usernameOrEmail,
      new_password: newPassword,
    }
  )
  return response
}

// 刷新 token
export const refreshToken = async (
  refreshToken: string
): Promise<ResponseType<TokenType>> => {
  const response = await request.post<ResponseType<TokenType>>(
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
export const logout = async (
  accessToken: string
): Promise<ResponseType<boolean>> => {
  const response = await request.post<ResponseType<boolean>>(
    '/auth/logout',
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )
  return response
}
