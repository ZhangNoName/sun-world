import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ThemeProvider } from '@/shared/design/theme'
import { ThemeSwitch } from './index'

function renderSwitch() {
  return render(
    <ThemeProvider>
      <ThemeSwitch />
    </ThemeProvider>
  )
}

describe('ThemeSwitch', () => {
  it('switches to dark mode in one click', async () => {
    renderSwitch()
    const switcher = screen.getByRole('button', { name: '切换到深色模式' })

    fireEvent.click(switcher)

    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute(
        'data-color-mode',
        'dark'
      )
    )
    expect(
      screen.getByRole('button', { name: '切换到浅色模式' })
    ).toBeInTheDocument()
  })

  it('hides theme details until the skin system is ready', () => {
    renderSwitch()

    expect(screen.queryByText('主题选项')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: '颜色模式' })).toBeNull()
    expect(screen.getByRole('button', { name: /切换到/ })).toBeInTheDocument()
  })
})
