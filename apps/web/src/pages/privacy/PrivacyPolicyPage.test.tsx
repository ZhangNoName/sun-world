import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import PrivacyPolicyPage from './PrivacyPolicyPage'

describe('PrivacyPolicyPage', () => {
  it('publishes the limited Google login data contract and user controls', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>
    )

    const main = screen.getByRole('main')
    expect(
      within(main).getByRole('heading', { level: 1, name: '隐私政策' })
    ).toBeVisible()
    expect(main).toHaveTextContent('姓名、邮箱地址、头像')
    expect(main).toHaveTextContent('账号唯一标识符')
    expect(main).toHaveTextContent(
      '创建新的 Sun World 账号，或登录此前已连接该 Google 身份的 Sun World 账号'
    )
    expect(main).toHaveTextContent(
      'OAuth 授权码、Google access token 和 ID token'
    )
    expect(main).toHaveTextContent(
      '不将这些授权码或 token 写入数据库，也不作持久化保存'
    )
    expect(main).toHaveTextContent('不出售 Google 账号资料')
    expect(main).toHaveTextContent('不会向其他第三方转移或披露这些资料')
    expect(main).toHaveTextContent('HttpOnly 且 Secure 的会话 Cookie')
    expect(main).toHaveTextContent('仅在对应身份关联或 Sun World 账号仍存在')
    expect(main).toHaveTextContent('不会用于恢复已删除的登录资料')

    expect(
      screen.getByRole('link', { name: 'Google 隐私政策' })
    ).toHaveAttribute('href', 'https://policies.google.com/privacy')
    expect(
      screen.getByRole('link', { name: '第三方连接管理说明' })
    ).toHaveAttribute(
      'href',
      'https://support.google.com/accounts/answer/13533235'
    )
    expect(
      screen.getByRole('link', { name: 'Sun World 数据删除请求入口' })
    ).toHaveAttribute(
      'href',
      'https://github.com/ZhangNoName/sun-world/issues/new'
    )
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute(
      'href',
      '/login'
    )
  })
})
