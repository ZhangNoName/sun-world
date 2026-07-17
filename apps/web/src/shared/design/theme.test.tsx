import { renderHook, act } from '@testing-library/react'

import { ThemeProvider, useTheme } from './theme'

describe('ThemeProvider', () => {
  it('persists and applies theme changes', () => {
    localStorage.setItem('theme', 'sun-dark')
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    expect(result.current.theme).toBe('sun-dark')
    expect(document.documentElement).toHaveClass('sun-dark')

    act(() => result.current.toggleTheme())
    expect(localStorage.getItem('theme')).toBe('sun-light')
    expect(document.documentElement).toHaveClass('sun-light')
  })
})
