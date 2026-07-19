import { render, screen } from '@testing-library/react'
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
})
