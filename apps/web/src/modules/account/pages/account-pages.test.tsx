import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { LoginPage } from '@/pages/login/login'
import { RegisterPage } from '@/pages/login/register'
import { useAuthStore } from '@/store/auth'
import { renderApp } from '@/test/render'

describe('account pages', () => {
  it('keeps login validation and backend failures inside the form', async () => {
    const login = vi.fn().mockRejectedValue(new Error('账号不存在'))
    useAuthStore.setState({ login })
    renderApp(<LoginPage />, { route: '/login' })
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请输入账号和密码')
    await userEvent.type(screen.getByLabelText('账号'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('密码'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('账号不存在')
  })

  it('validates password confirmation before registration', async () => {
    renderApp(<RegisterPage />, { route: '/register' })
    await userEvent.type(screen.getByLabelText('用户名'), 'Tester')
    await userEvent.type(screen.getByLabelText('密码'), 'secret11')
    await userEvent.type(screen.getByLabelText('确认密码'), 'secret22')
    await userEvent.click(screen.getByRole('button', { name: '注册' }))
    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致')
  })

  it('keeps usernames separate from verified contact identifiers', async () => {
    renderApp(<RegisterPage />, { route: '/register' })
    await userEvent.type(screen.getByLabelText('用户名'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('密码'), 'secret123')
    await userEvent.type(screen.getByLabelText('确认密码'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: '注册' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '用户名不能是邮箱或手机号'
    )
  })
})
