import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import {
  completeConnectionVerification,
  getAccountConnections,
  getAuthMethods,
  getCurrentUser,
  requestConnectionVerificationCode,
  startOAuthConnect,
} from '@/modules/account/api'
import { useAuthStore } from '@/store/auth'
import { renderApp } from '@/test/render'

import { MePage } from './me'

const navigate = vi.hoisted(() => vi.fn())
const defaultLogout = useAuthStore.getState().logout

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}))

vi.mock('@/modules/account/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/account/api')>()
  return {
    ...actual,
    getAccountConnections: vi.fn(),
    getAuthMethods: vi.fn(),
    getCurrentUser: vi.fn(),
    requestConnectionVerificationCode: vi.fn(),
    completeConnectionVerification: vi.fn(),
    startOAuthConnect: vi.fn(),
  }
})

describe('MePage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.setState({
      status: 'anonymous',
      user: null,
      logout: defaultLogout,
    })
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('anonymous'))
    vi.mocked(getAuthMethods).mockResolvedValue([
      { id: 'google', kind: 'oauth', label: 'Google', enabled: true },
      { id: 'qq', kind: 'oauth', label: 'QQ', enabled: true },
      { id: 'wechat', kind: 'oauth', label: '微信', enabled: true },
    ])
  })

  it('keeps the site and AI entry available to guests', async () => {
    renderApp(<MePage />, { route: '/me' })

    expect(
      await screen.findByRole('heading', { name: '不登录也能继续探索' })
    ).toBeVisible()
    expect(screen.getByRole('link', { name: '先体验 AI' })).toHaveAttribute(
      'href',
      '/aigc'
    )
    expect(getAccountConnections).not.toHaveBeenCalled()
  })

  it('shows verified contacts and linked identities for an account', async () => {
    vi.mocked(getAccountConnections).mockResolvedValue({
      contacts: [
        {
          id: 'contact-1',
          kind: 'phone',
          value_hint: '+86 138****8000',
          verification_source: 'google',
          verified_at: '2026-08-29T09:00:00Z',
        },
      ],
      identities: [
        {
          id: 'identity-1',
          provider: 'google',
          display_name: 'Zhang',
          avatar_url: null,
          linked_at: '2026-08-29T09:00:00Z',
          last_authenticated_at: '2026-08-29T10:00:00Z',
        },
      ],
    })
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
    })

    renderApp(<MePage />, { route: '/me' })

    expect(await screen.findByText('+86 138****8000')).toBeVisible()
    expect(screen.getByText('Google')).toBeVisible()
    expect(screen.getByText(/仅第三方明确返回的已验证手机号/)).toBeVisible()
  })

  it('verifies a new contact before attaching it to the current account', async () => {
    vi.mocked(getAccountConnections).mockResolvedValue({
      contacts: [],
      identities: [],
    })
    vi.mocked(requestConnectionVerificationCode).mockResolvedValue({
      challenge_id: 'verify_challenge_identifier',
      channel: 'phone',
      target_hint: '+86****8000',
      expires_in: 300,
      resend_after: 60,
    })
    vi.mocked(completeConnectionVerification).mockResolvedValue({
      contacts: [
        {
          id: 'contact-2',
          kind: 'phone',
          value_hint: '+86****8000',
          verification_source: 'site_otp',
          verified_at: '2026-08-29T10:00:00Z',
        },
      ],
      identities: [],
    })
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
    })
    renderApp(<MePage />, { route: '/me' })

    await userEvent.click(screen.getByText('添加已验证方式'))
    await userEvent.type(screen.getByLabelText('手机号'), '13800138000')
    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }))
    await userEvent.type(await screen.findByLabelText('6 位验证码'), '123456')
    await userEvent.click(screen.getByRole('button', { name: '完成关联' }))

    expect(requestConnectionVerificationCode).toHaveBeenCalledWith({
      channel: 'phone',
      target: '13800138000',
    })
    expect(completeConnectionVerification).toHaveBeenCalledWith({
      challenge_id: 'verify_challenge_identifier',
      code: '123456',
    })
    expect(await screen.findByText('+86****8000')).toBeVisible()
  })

  it('starts an explicit connect flow with an account-local safe return path', async () => {
    vi.mocked(getAccountConnections).mockResolvedValue({
      contacts: [],
      identities: [
        {
          id: 'identity-1',
          provider: 'google',
          display_name: 'Tester',
          avatar_url: null,
          linked_at: '2026-08-29T09:00:00Z',
          last_authenticated_at: '2026-08-29T10:00:00Z',
        },
      ],
    })
    vi.mocked(startOAuthConnect).mockReturnValue(
      new Promise<never>(() => undefined)
    )
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
    })
    renderApp(<MePage />, { route: '/me' })

    expect(
      await screen.findByRole('button', { name: 'Google 已连接' })
    ).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '连接 QQ' }))

    expect(startOAuthConnect).toHaveBeenCalledWith(
      'qq',
      '/me?panel=connections'
    )
    expect(screen.getByRole('button', { name: '正在跳转…' })).toBeDisabled()
  })

  it('requires logout and fresh authentication when connect needs step-up', async () => {
    vi.mocked(getAccountConnections).mockResolvedValue({
      contacts: [],
      identities: [],
    })
    vi.mocked(startOAuthConnect).mockRejectedValue(
      Object.assign(
        new Error('此安全操作需要近期登录，请退出后重新登录再试。'),
        { code: 'AUTH_STEP_UP_REQUIRED' }
      )
    )
    const logout = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
      logout,
    })
    renderApp(<MePage />, { route: '/me' })

    await userEvent.click(
      await screen.findByRole('button', { name: '连接 QQ' })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '此安全操作需要近期登录，请退出后重新登录再试。'
    )
    await userEvent.click(
      screen.getByRole('button', { name: '重新登录后关联' })
    )

    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(
      '/login?return_to=%2Fme%3Fpanel%3Dconnections'
    )
  })

  it('does not reuse login OTP when contact linking needs step-up', async () => {
    vi.mocked(getAccountConnections).mockResolvedValue({
      contacts: [],
      identities: [],
    })
    vi.mocked(requestConnectionVerificationCode).mockRejectedValue(
      Object.assign(
        new Error('此安全操作需要近期登录，请退出后重新登录再试。'),
        { code: 'AUTH_STEP_UP_REQUIRED' }
      )
    )
    const logout = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
      logout,
    })
    renderApp(<MePage />, { route: '/me' })

    await userEvent.click(await screen.findByText('添加已验证方式'))
    await userEvent.type(screen.getByLabelText('手机号'), '13800138000')
    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(requestConnectionVerificationCode).toHaveBeenCalledWith({
      channel: 'phone',
      target: '13800138000',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '此安全操作需要近期登录，请退出后重新登录再试。'
    )
    await userEvent.click(
      screen.getByRole('button', { name: '重新登录后关联' })
    )
    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(
      '/login?return_to=%2Fme%3Fpanel%3Dconnections'
    )
  })
})
