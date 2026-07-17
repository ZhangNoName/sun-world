import { create } from 'zustand'

import {
  getCurrentUser,
  login as accountLogin,
  register as accountRegister,
} from '@/modules/account/api'
import type { AuthSession, UserInfo } from '@/modules/account/types'
import { getDeviceId } from '@/util/auth'
import { getAccessTokenExpire, getRefreshTokenExpire } from '@/util/cookie'

interface RegisterInput {
  name: string
  phone: string
  email: string
  password: string
}

interface AuthState {
  accessTokenExpire: number | null
  refreshTokenExpire: number | null
  deviceId: string
  user: UserInfo | null
  syncExpireFromCookie: () => void
  updateTokenExpire: (session: AuthSession) => void
  clearTokens: () => void
  isAccessTokenExpired: () => boolean
  isAccessTokenExpiringSoon: () => boolean
  isRefreshTokenExpired: () => boolean
  refreshTokensIfNeeded: () => Promise<void>
  login: (username: string, password: string) => Promise<AuthSession>
  register: (data: RegisterInput) => ReturnType<typeof accountRegister>
  logout: () => Promise<void>
  getUser: () => Promise<UserInfo | null>
}

function expiryFromSession(value?: string | null) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessTokenExpire: getAccessTokenExpire(),
  refreshTokenExpire: getRefreshTokenExpire(),
  deviceId: getDeviceId(),
  user: null,

  syncExpireFromCookie() {
    const accessTokenExpire = getAccessTokenExpire()
    const refreshTokenExpire = getRefreshTokenExpire()
    set((state) => ({
      accessTokenExpire: accessTokenExpire ?? state.accessTokenExpire,
      refreshTokenExpire: refreshTokenExpire ?? state.refreshTokenExpire,
    }))
  },

  updateTokenExpire(session) {
    set({
      accessTokenExpire:
        getAccessTokenExpire() ??
        expiryFromSession(session.access_token_expire),
      refreshTokenExpire:
        getRefreshTokenExpire() ??
        expiryFromSession(session.refresh_token_expire),
    })
  },

  clearTokens() {
    set({ accessTokenExpire: null, refreshTokenExpire: null, user: null })
  },

  isAccessTokenExpired() {
    get().syncExpireFromCookie()
    const expires = get().accessTokenExpire
    return expires === null || Date.now() > expires
  },

  isAccessTokenExpiringSoon() {
    get().syncExpireFromCookie()
    const expires = get().accessTokenExpire
    return expires === null || Date.now() + 5 * 60 * 1000 >= expires
  },

  isRefreshTokenExpired() {
    get().syncExpireFromCookie()
    const expires = get().refreshTokenExpire
    return expires === null || Date.now() > expires
  },

  async refreshTokensIfNeeded() {
    if (!get().isAccessTokenExpiringSoon()) return
    if (get().isRefreshTokenExpired()) {
      get().clearTokens()
      throw new Error('Refresh token 已过期，需要重新登录')
    }
  },

  async login(username, password) {
    const session = await accountLogin({ username, password })
    get().updateTokenExpire(session)
    await get().getUser()
    return session
  },

  async register(data) {
    const session = await accountRegister(data)
    get().updateTokenExpire(session as AuthSession)
    return session
  },

  async logout() {
    get().clearTokens()
  },

  async getUser() {
    try {
      const user = await getCurrentUser()
      set({ user })
      return user
    } catch {
      set({ user: null })
      return null
    }
  },
}))
