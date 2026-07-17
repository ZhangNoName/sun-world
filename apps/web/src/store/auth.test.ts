import { useAuthStore } from './auth'

describe('useAuthStore', () => {
  beforeEach(() => {
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
})
