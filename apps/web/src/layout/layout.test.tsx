import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { useDeviceStore } from '@/store/tg'
import { AppLayout } from './layout'

vi.mock('@/components/LanguageSwitch', () => ({ default: () => null }))
vi.mock('@/components/ThemeSwitch', () => ({ default: () => null }))

describe('AppLayout mobile navigation', () => {
  it('opens as a modal dialog and restores focus to its trigger', async () => {
    useDeviceStore.setState({ isMobile: true })
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
    render(<RouterProvider router={router} />)
    const trigger = screen.getByRole('button', { name: '菜单' })
    trigger.focus()

    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: '导航菜单' })).toBeVisible()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
