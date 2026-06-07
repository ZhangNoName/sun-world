import { getCurrentUser } from '@/modules/account'
import type { UserInfo } from '@/modules/account'

export const getUserMe = async (): Promise<UserInfo> => {
  const response = await getCurrentUser()
  return response
}
