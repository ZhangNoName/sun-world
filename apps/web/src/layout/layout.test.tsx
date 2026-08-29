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
    const trigger = screen.getByRole('button', { name: '菜单' })
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

  it('returns to the top without smooth scrolling when motion is reduced', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    )
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

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
