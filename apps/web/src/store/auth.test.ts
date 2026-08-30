import { useAuthStore } from './auth'
import {
  logout as accountLogout,
  getCurrentUser,
  getSessionStatus,
  refreshToken,
} from '@/modules/account/api'
import { vi } from 'vitest'

vi.mock('@/modules/account/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionStatus: vi.fn(),
  refreshToken: vi.fn(),
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().clearTokens()
  })

  it('detects expired and soon-expiring access sessions', () => {
    useAuthStore.setState({
      accessTokenExpire: Date.now() + 60_000,
      refreshTokenExpire: Date.now() + 3_600_000,
    })

    expect(useAuthStore.getState().isAccessTokenExpired()).toBe(false)
    expect(useAuthStore.getState().isAccessTokenExpiringSoon()).toBe(true)
  })

  it('clears user and expirations together', () => {
    useAuthStore.setState({
      accessTokenExpire: 1,
      refreshTokenExpire: 2,
      user: { id: 1 } as never,
    })

    useAuthStore.getState().clearTokens()

    expect(useAuthStore.getState()).toMatchObject({
      accessTokenExpire: null,
      refreshTokenExpire: null,
      user: null,
    })
  })

  it('calls the server logout endpoint and clears stale auth after a failed user restore', async () => {
    vi.mocked(accountLogout).mockResolvedValue(null)
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('expired'))
    useAuthStore.setState({
      accessTokenExpire: Date.now() + 60_000,
      refreshTokenExpire: Date.now() + 60_000,
      user: { id: 2 } as never,
    })

    await useAuthStore.getState().logout()
    await useAuthStore.getState().getUser()

    expect(accountLogout).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessTokenExpire).toBeNull()
  })

  it('restores a persisted cookie session once for concurrent callers', async () => {
    const user = { id: 3, name: 'restored' } as never
    vi.mocked(getCurrentUser).mockResolvedValue(user)

    const [first, second] = await Promise.all([
      useAuthStore.getState().restoreSession(),
      useAuthStore.getState().restoreSession(),
    ])

    expect(first).toBe(user)
    expect(second).toBe(user)
    expect(getCurrentUser).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      user,
    })
  })

  it('uses the explicit POST refresh endpoint before restoring an expired access session', async () => {
    const user = { id: 6, name: 'restored-after-refresh' } as never
    useAuthStore.setState({
      accessTokenExpire: Date.now() - 1_000,
      refreshTokenExpire: Date.now() + 60_000,
    })
    vi.mocked(refreshToken).mockResolvedValue({
      access_token_expire: new Date(Date.now() + 60_000).toISOString(),
      refresh_token_expire: new Date(Date.now() + 86_400_000).toISOString(),
    } as never)
    vi.mocked(getSessionStatus).mockRejectedValue(new Error('access expired'))
    vi.mocked(getCurrentUser).mockResolvedValue(user)

    const restored = await useAuthStore.getState().restoreSession()

    expect(restored).toBe(user)
    expect(refreshToken).toHaveBeenCalledOnce()
    expect(getCurrentUser).toHaveBeenCalledOnce()
  })

  it('refreshes the cookie session and restores the current user', async () => {
    vi.mocked(refreshToken).mockResolvedValue({
      access_token_expire: new Date(Date.now() + 60_000).toISOString(),
      refresh_token_expire: new Date(Date.now() + 86_400_000).toISOString(),
    } as never)
    vi.mocked(getSessionStatus).mockRejectedValue(new Error('access expired'))

    await useAuthStore.getState().refreshSession()

    expect(refreshToken).toHaveBeenCalledOnce()
    expect(getSessionStatus).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().status).toBe('anonymous')
  })

  it('clears the session when refresh fails', async () => {
    vi.mocked(refreshToken).mockRejectedValue(new Error('expired'))
    useAuthStore.setState({ user: { id: 5 } as never, status: 'authenticated' })

    await expect(useAuthStore.getState().refreshSession()).rejects.toThrow(
      'expired'
    )

    expect(useAuthStore.getState()).toMatchObject({
      status: 'anonymous',
      user: null,
      accessTokenExpire: null,
      refreshTokenExpire: null,
    })
  })
})
