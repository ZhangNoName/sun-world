import { fireEvent, render, screen } from '@testing-library/react'

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
  it('switches to the other design family in one click', () => {
    renderSwitch()
    const switcher = screen.getByRole('button', { name: '切换到 Apple 风格' })

    fireEvent.click(switcher)

    expect(document.documentElement).toHaveAttribute('data-design', 'apple')
    expect(
      screen.getByRole('button', { name: '切换到 Sun World 风格' })
    ).toBeInTheDocument()
  })

  it('offers precise family and color mode choices', () => {
    renderSwitch()
    fireEvent.click(screen.getByText('主题选项'))

    expect(screen.getByRole('radiogroup', { name: '设计风格' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Sun World' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Apple' }))
    expect(document.documentElement).toHaveAttribute('data-design', 'apple')

    expect(screen.getByRole('radiogroup', { name: '明暗模式' })).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: '深色' }))
    expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark')
  })
})
