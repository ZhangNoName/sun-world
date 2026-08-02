import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  requestUse: vi.fn(),
  responseUse: vi.fn(),
  serviceRequest: vi.fn(),
  refreshSession: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: harness.requestUse },
        response: { use: harness.responseUse },
      },
      request: harness.serviceRequest,
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
  },
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: {
    getState: () => ({
      status: 'authenticated',
      user: { id: 1 },
      refreshSession: harness.refreshSession,
      syncExpireFromCookie: vi.fn(),
    }),
  },
}))

vi.mock('@sun-world/ui/toast', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('HTTP auth recovery', () => {
  let rejectResponse: (error: unknown) => Promise<unknown>

  beforeEach(async () => {
    harness.requestUse.mockClear()
    harness.responseUse.mockClear()
    harness.serviceRequest.mockReset()
    harness.refreshSession.mockReset()
    await import('./http')
    rejectResponse = harness.responseUse.mock.calls[0][1]
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('refreshes once and replays an unauthorized request', async () => {
    harness.refreshSession.mockResolvedValue(undefined)
    harness.serviceRequest.mockResolvedValue({ status: 200, data: 'ok' })

    const result = await rejectResponse({
      response: {
        status: 401,
        data: { code: 401, msg: 'expired' },
        headers: {},
      },
      config: { url: '/content', method: 'get' },
    })

    expect(harness.refreshSession).toHaveBeenCalledOnce()
    expect(harness.serviceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/content', _authRetry: true })
    )
    expect(result).toEqual({ status: 200, data: 'ok' })
  })

  it('does not replay an already retried request', async () => {
    harness.refreshSession.mockResolvedValue(undefined)

    await expect(
      rejectResponse({
        response: { status: 401, data: {}, headers: {} },
        config: { url: '/content', method: 'get', _authRetry: true },
      })
    ).rejects.toMatchObject({ status: 401 })

    expect(harness.refreshSession).not.toHaveBeenCalled()
    expect(harness.serviceRequest).not.toHaveBeenCalled()
  })

  it('does not refresh a public request when there is no session', async () => {
    const authModule = await import('@/store/auth')
    vi.spyOn(authModule.useAuthStore, 'getState').mockReturnValue({
      status: 'anonymous',
      user: null,
      refreshSession: harness.refreshSession,
      syncExpireFromCookie: vi.fn(),
    } as never)

    await expect(
      rejectResponse({
        response: { status: 401, data: {}, headers: {} },
        config: { url: '/public', method: 'get' },
      })
    ).rejects.toMatchObject({ status: 401 })

    expect(harness.refreshSession).not.toHaveBeenCalled()
  })

  it('does not refresh an explicit unauthenticated response', async () => {
    await expect(
      rejectResponse({
        response: {
          status: 401,
          data: {
            detail: { code: 'AUTH_UNAUTHORIZED', message: 'please login' },
          },
          headers: {},
        },
        config: { url: '/user/me', method: 'get' },
      })
    ).rejects.toMatchObject({
      code: 'AUTH_UNAUTHORIZED',
      status: 401,
    })

    expect(harness.refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes and replays a business envelope token-expired response', async () => {
    harness.refreshSession.mockResolvedValue(undefined)
    harness.serviceRequest.mockResolvedValue({ status: 200, data: 'ok' })

    const result = await rejectResponse({
      response: {
        status: 200,
        data: { code: 'AUTH_TOKEN_EXPIRED', msg: 'expired' },
        headers: {},
      },
      config: { url: '/content', method: 'get' },
    })

    expect(harness.refreshSession).toHaveBeenCalledOnce()
    expect(harness.serviceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/content', _authRetry: true })
    )
    expect(result).toEqual({ status: 200, data: 'ok' })
  })
})
