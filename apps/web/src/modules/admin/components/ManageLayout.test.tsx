import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

import { setLocale } from '@/i18n'
import { ThemeProvider } from '@/shared/design/theme'
import { useAuthStore } from '@/store/auth'
import type { UserInfo } from '@/modules/account/types'
import { ManageLayout } from './ManageLayout'

describe('ManageLayout', () => {
  beforeEach(async () => {
    await setLocale('zh')
    useAuthStore.setState({
      user: {
        name: 'Ada Admin',
        roles: [{ code: 'admin' }],
      } as unknown as UserInfo,
    })
    window.localStorage.clear()
  })

  function renderLayout() {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/manage/system/logs']}>
          <Routes>
            <Route path="/manage/*" element={<ManageLayout />}>
              <Route path="system/logs" element={<div>Audit page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
  }

  it('renders an independent recursive shell and active route', () => {
    renderLayout()
    expect(screen.getByText('太阳世界管理')).toBeInTheDocument()
    expect(screen.getByText('Audit page')).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sidebar-wrapper"]')
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute(
      'data-slot',
      'sidebar-inset'
    )
    expect(document.querySelector('.manage-topbar')).not.toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', { name: '管理导航' })
    expect(sidebar.querySelector('.manage-sidebar-toggle')).toBeInTheDocument()
    const themeSwitch = sidebar.querySelector('.manage-theme-switch')
    const languageSwitch = sidebar.querySelector('.manage-language-switch')
    expect(themeSwitch).toBeInTheDocument()
    expect(languageSwitch).toBeInTheDocument()
    expect(themeSwitch?.compareDocumentPosition(languageSwitch!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(screen.getByRole('link', { name: '审计日志' })).toHaveClass(
      'is-active'
    )
    expect(
      screen.queryByRole('navigation', { name: '绉诲姩瀵艰埅' })
    ).not.toBeInTheDocument()
  })

  it('supports collapse, hide/restore, mobile drawer, and upward account menu controls', () => {
    renderLayout()
    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
    expect(screen.getByRole('button', { name: '展开侧栏' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '隐藏侧栏' }))
    expect(
      screen.queryByRole('complementary', { name: '管理导航' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢复侧栏' }))
    expect(
      screen.getByRole('complementary', { name: '管理导航' })
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Ada Admin 的账户菜单' })
    )
    expect(screen.getByText('个人资料')).toBeInTheDocument()
  })

  it('defaults to Chinese and switches management copy from the lower-left menu', async () => {
    renderLayout()

    expect(
      screen.getByRole('button', { name: '语言：中文' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '语言：中文' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Audit logs' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Language: English' })
      ).toBeInTheDocument()
    })
  })

  it('redirects legacy management paths to canonical routes', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/manage/logs']}>
          <Routes>
            <Route path="/manage/*" element={<ManageLayout />}>
              <Route path="system/logs" element={<div>Audit page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    )

    await waitFor(() =>
      expect(screen.getByText('Audit page')).toBeInTheDocument()
    )
  })
})
