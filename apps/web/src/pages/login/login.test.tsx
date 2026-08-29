import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './login'
import { ThemeProvider } from '@/shared/design/theme'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  navigate: vi.fn(),
  success: vi.fn(),
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: { login: typeof mocks.login }) => unknown) =>
    selector({ login: mocks.login }),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  }
})

vi.mock('@sun-world/ui/toast', () => ({
  toast: {
    success: mocks.success,
  },
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LoginPage />
      </ThemeProvider>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.login.mockReset()
    mocks.navigate.mockReset()
    mocks.success.mockReset()
  })

  it('uses a full-height login-04 style auth layout', () => {
    renderLogin()

    expect(screen.getByRole('main')).toHaveAttribute(
      'data-auth-layout',
      'login-04'
    )
    expect(screen.getByRole('region', { name: 'Sun World' })).toBeVisible()
    expect(
      screen.getByText('选择适合你的登录方式，或直接以访客身份继续。')
    ).toBeVisible()
    expect(document.querySelector('[data-slot="card"]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '隐私政策' })).toHaveAttribute(
      'href',
      '/privacy'
    )
  })

  it('shows validation feedback before calling the auth service', () => {
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请输入账号和密码')
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('uses the complete official Google button artwork with a Chinese accessible label', () => {
    renderLogin()

    const googleButton = screen.getByRole('button', {
      name: '使用 Google 登录',
    })
    const googleMark = googleButton.querySelector<HTMLImageElement>(
      'img.auth-google-provider-button__image'
    )

    expect(googleButton).toHaveClass('auth-google-provider-button')
    expect(googleButton).toHaveAttribute('aria-label', '使用 Google 登录')
    expect(googleButton.querySelector('span')).toBeNull()
    expect(googleMark).toHaveAttribute(
      'src',
      '/brands/google-sign-in-light-square.svg'
    )
    expect(googleMark).toHaveAttribute('alt', '')
    expect(googleMark).toHaveAttribute('aria-hidden', 'true')
    expect(googleMark).toHaveAttribute('width', '180')
    expect(googleMark).toHaveAttribute('height', '40')
    expect(
      screen.getByText(
        '已有 Sun World 账号？请先用原方式登录，再到个人中心连接 Google；不会按同名邮箱自动合并。'
      )
    ).toBeVisible()
  })

  it('submits credentials and navigates after login', async () => {
    mocks.login.mockResolvedValue(undefined)
    renderLogin()

    fireEvent.change(screen.getByLabelText('账号'), {
      target: { value: 'sun@example.com' },
    })
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith('sun@example.com', 'secret123')
    )
    expect(mocks.success).toHaveBeenCalledWith('登录成功')
    expect(mocks.navigate).toHaveBeenCalledWith('/')
  })
})
