import { API_ROUTES } from '@sun-world/contracts'

import { apiGet, request } from '@/shared/api'
import {
  getAuthMethods,
  requestConnectionVerificationCode,
  startOAuthConnect,
} from './api'

vi.mock('@/shared/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  request: { post: vi.fn() },
}))

describe('account OAuth API', () => {
  it('loads optional method availability without a global error toast', async () => {
    vi.mocked(apiGet).mockResolvedValue([] as never)

    await getAuthMethods()

    expect(apiGet).toHaveBeenCalledWith(API_ROUTES.auth.methods, {
      config: { suppressErrorToast: true },
    })
  })

  it('starts an authenticated connect flow without relying on login defaults', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      provider: 'qq',
      flow: 'connect',
      authorization_url: 'https://graph.qq.com/oauth2.0/authorize',
    } as never)

    await startOAuthConnect('qq', '/me?panel=connections')

    expect(apiGet).toHaveBeenCalledWith(API_ROUTES.auth.oauthStart, {
      path: { provider: 'qq' },
      query: {
        return_to: '/me?panel=connections',
        flow: 'connect',
      },
      config: { suppressErrorToast: true },
    })
  })

  it('uses the connection-purpose endpoint for account contact linking', async () => {
    vi.mocked(request.post).mockResolvedValue({
      challenge_id: 'challenge-identifier-long-enough',
      channel: 'phone',
      target_hint: '+86****8000',
      expires_in: 300,
      resend_after: 60,
    })

    await requestConnectionVerificationCode({
      channel: 'phone',
      target: '13800138000',
    })

    expect(request.post).toHaveBeenCalledWith(
      '/auth/connections/verification/request',
      { channel: 'phone', target: '13800138000' },
      { suppressErrorToast: true }
    )
  })
})
