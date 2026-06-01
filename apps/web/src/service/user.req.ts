import { UserInfo } from '@/types/user.type'
import { request } from './http'

const prefix = '/user'
interface RegisterParams {
  name: string
  phone: string
  email: string
  password: string
}

export const getUserMe = async (): Promise<UserInfo> => {
  const response = await request.get<UserInfo>(`${prefix}/me`)
  return response
}
