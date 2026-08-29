import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { useDeviceStore } from '@/store/tg'
import { AppLayout } from './layout'

vi.mock('@/components/LanguageSwitch', () => ({ default: () => null }))
vi.mock('@/components/ThemeSwitch', () => ({ default: () => null }))

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [{ index: true, element: <p>Home</p> }],
      },
    ],
    { initialEntries: ['/'] }
  )
  return render(<RouterProvider router={router} />)
}

describe('AppLayout navigation', () => {
  it('opens the mobile menu as a modal dialog and restores focus', async () => {
    useDeviceStore.setState({ isMobile: true })
    renderLayout()
    const trigger = screen.getByRole('button', { name: '打开导航菜单' })
    trigger.focus()

    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: '导航菜单' })).toBeVisible()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('labels the desktop shortcut navigation', () => {
    useDeviceStore.setState({ isMobile: false })
    renderLayout()

    expect(screen.getByRole('navigation', { name: '快捷导航' })).toBeVisible()
    expect(screen.getByRole('banner')).toHaveClass('theme-chrome')
  })

  it('gives icon-only mobile shortcuts accessible names', () => {
    useDeviceStore.setState({ isMobile: true })
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: '移动导航' })
    expect(navigation).toBeVisible()
    expect(screen.getByRole('link', { name: '首页' })).toBeVisible()
    expect(screen.getByRole('link', { name: '画布' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'AI 助手' })).toBeVisible()
    expect(screen.getByRole('link', { name: '我的' })).toBeVisible()
  })

  it('uses localized product labels in the mobile drawer', async () => {
    useDeviceStore.setState({ isMobile: true })
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: '打开导航菜单' }))

    const dialog = screen.getByRole('dialog', { name: '导航菜单' })
    expect(dialog).toHaveTextContent('首页')
    expect(dialog).toHaveTextContent('博客')
    expect(dialog).toHaveTextContent('AI 助手')
    expect(dialog).not.toHaveTextContent(/^home$/)
    expect(screen.getByLabelText('显示偏好')).toBeVisible()
  })

  it('offers a global back-to-top action after meaningful scrolling', async () => {
    useDeviceStore.setState({ isMobile: true })
    renderLayout()
    const scrollRoot = document.querySelector<HTMLElement>('.app-container')
    expect(scrollRoot).not.toBeNull()
    Object.defineProperty(scrollRoot, 'scrollTop', {
      configurable: true,
      value: 480,
      writable: true,
    })

    fireEvent.scroll(scrollRoot!)

    const backToTop = await screen.findByRole('button', { name: '返回顶部' })
    const scrollTo = vi.fn()
    scrollRoot!.scrollTo = scrollTo
    await userEvent.click(backToTop)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})
