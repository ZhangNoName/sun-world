import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { useAuthStore } from '@/store/auth'
import { renderApp } from '@/test/render'
import { AuthCallbackPage } from './qqCb'

const navigate = vi.hoisted(() => vi.fn())
const defaultLogout = useAuthStore.getState().logout

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigate,
}))

describe('AuthCallbackPage connect flow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.setState({
      status: 'anonymous',
      user: null,
      logout: defaultLogout,
    })
  })

  it('requires logout before recent-auth step-up', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
      logout,
    })
    renderApp(<AuthCallbackPage />, {
      route:
        '/auth/callback?status=error&flow=connect&provider=qq' +
        '&return_to=%2Fme%3Fpanel%3Dconnections&code=AUTH_STEP_UP_REQUIRED',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '此安全操作需要近期登录，请退出后重新登录再试。'
    )
    await userEvent.click(
      screen.getByRole('button', { name: '重新登录后关联' })
    )

    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(
      '/login?return_to=%2Fme%3Fpanel%3Dconnections',
      { replace: true }
    )
  })

  it('explains that a disabled identity cannot be self-reactivated', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { name: 'Tester' } as never,
    })
    renderApp(<AuthCallbackPage />, {
      route:
        '/auth/callback?status=error&flow=connect&provider=google' +
        '&return_to=%2Fme&code=AUTH_IDENTITY_DISABLED',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '该第三方登录身份已停用，无法自行重新启用。'
    )
    expect(
      screen.queryByRole('button', { name: '重新登录后关联' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回账户设置' })).toBeVisible()
  })
})

describe('AuthCallbackPage login recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.setState({
      status: 'anonymous',
      user: null,
      logout: defaultLogout,
    })
  })

  it('explains how a legacy account owner can connect Google safely', async () => {
    renderApp(<AuthCallbackPage />, {
      route:
        '/auth/callback?status=error&flow=login&provider=google' +
        '&return_to=%2F&code=AUTH_LEGACY_CONTACT_REQUIRES_VERIFICATION',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请先使用原账号的用户名和密码登录，再到“账户中心”连接 Google。'
    )
    expect(screen.getByRole('button', { name: '返回登录页' })).toBeVisible()
  })
})
