import { create } from 'zustand'
import type { AxiosRequestConfig } from 'axios'

import {
  getCurrentUser,
  getSessionStatus,
  completeVerificationLogin,
  login as accountLogin,
  logout as accountLogout,
  refreshToken as accountRefreshToken,
  register as accountRegister,
} from '@/modules/account/api'
import type { AuthSession, UserInfo } from '@/modules/account/types'
import type {
  IdentitySession,
  VerificationCompleteParams,
} from '@/modules/account/types'
import { getDeviceId } from '@/util/auth'
import { getAccessTokenExpire, getRefreshTokenExpire } from '@/util/cookie'

interface RegisterInput {
  name: string
  password: string
}

export type AuthStatus = 'unknown' | 'restoring' | 'authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
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
  restoreSession: () => Promise<UserInfo | null>
  refreshSession: (config?: AxiosRequestConfig) => Promise<void>
  login: (username: string, password: string) => Promise<AuthSession>
  loginWithVerification: (
    data: VerificationCompleteParams
  ) => Promise<IdentitySession>
  register: (data: RegisterInput) => ReturnType<typeof accountRegister>
  logout: () => Promise<void>
  getUser: () => Promise<UserInfo | null>
}

function expiryFromSession(value?: string | null) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

async function withAuthRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return work()
  return navigator.locks.request('sun-world-auth-refresh', work)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
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
    set({
      accessTokenExpire: null,
      refreshTokenExpire: null,
      user: null,
      status: 'anonymous',
    })
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
    get().syncExpireFromCookie()
    if (get().accessTokenExpire === null) return
    if (!get().isAccessTokenExpiringSoon()) return
    if (get().isRefreshTokenExpired()) {
      get().clearTokens()
      throw new Error('Refresh token 已过期，需要重新登录')
    }
    await get().refreshSession()
  },

  async restoreSession() {
    if (get().status === 'authenticated' && get().user) return get().user
    if (restorePromise) return restorePromise

    set({ status: 'restoring' })
    get().syncExpireFromCookie()
    const restoreFromCookies = async () => {
      if (get().isAccessTokenExpired() && !get().isRefreshTokenExpired()) {
        await withAuthRefreshLock(async () => {
          try {
            const remoteSession = await getSessionStatus({
              suppressErrorToast: true,
              skipAuthPreflight: true,
              _authRetry: true,
            })
            get().updateTokenExpire(remoteSession)
            return
          } catch {
            // The shared API-host cookie is still stale; this tab owns refresh.
          }
          const session = await accountRefreshToken({
            suppressErrorToast: true,
          })
          get().updateTokenExpire(session as AuthSession)
        })
      }
      return getCurrentUser({ suppressErrorToast: true })
    }
    restorePromise = restoreFromCookies()
      .then((user) => {
        set({ user, status: 'authenticated' })
        get().syncExpireFromCookie()
        return user
      })
      .catch(() => {
        get().clearTokens()
        return null
      })
      .finally(() => {
        restorePromise = null
      })

    return restorePromise
  },

  async refreshSession(config) {
    if (refreshPromise) return refreshPromise

    const observedExpiry = get().accessTokenExpire
    refreshPromise = withAuthRefreshLock(async () => {
      try {
        const remoteSession = await getSessionStatus({
          suppressErrorToast: true,
          skipAuthPreflight: true,
          _authRetry: true,
        })
        const remoteExpiry = expiryFromSession(
          remoteSession.access_token_expire
        )
        get().updateTokenExpire(remoteSession)
        const anotherContextRefreshed =
          observedExpiry === null ||
          (remoteExpiry !== null && remoteExpiry > observedExpiry + 1_000)
        if (anotherContextRefreshed || !get().isAccessTokenExpiringSoon())
          return
      } catch {
        // Expired access is expected here; the refresh cookie is still HttpOnly.
      }
      const session = await accountRefreshToken(config)
      get().updateTokenExpire(session as AuthSession)
    })
      .then(() => undefined)
      .catch((error) => {
        get().clearTokens()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })

    return refreshPromise
  },

  async login(username, password) {
    const session = await accountLogin({ username, password })
    get().updateTokenExpire(session)
    await get().restoreSession()
    return session
  },

  async loginWithVerification(data) {
    const session = await completeVerificationLogin(data)
    get().updateTokenExpire(session)
    await get().restoreSession()
    return session
  },

  async register(data) {
    const session = await accountRegister(data)
    get().updateTokenExpire(session as AuthSession)
    await get().restoreSession()
    return session
  },

  async logout() {
    try {
      await accountLogout()
    } finally {
      get().clearTokens()
    }
  },

  async getUser() {
    return get().restoreSession()
  },
}))

let restorePromise: Promise<UserInfo | null> | null = null
let refreshPromise: Promise<void> | null = null
