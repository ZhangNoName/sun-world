import { act, renderHook } from '@testing-library/react'

import { ThemeProvider, useTheme } from './theme'

function mockColorScheme(dark = false) {
  let matches = dark
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      ({
        get matches() {
          return matches
        },
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: (
          _type: 'change',
          listener: (event: MediaQueryListEvent) => void
        ) => listeners.add(listener),
        removeEventListener: (
          _type: 'change',
          listener: (event: MediaQueryListEvent) => void
        ) => listeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  )
  return (next: boolean) => {
    matches = next
    listeners.forEach((listener) =>
      listener({ matches: next } as MediaQueryListEvent)
    )
  }
}

describe('ThemeProvider', () => {
  it('defaults to system color mode without a design family', () => {
    mockColorScheme(false)
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    expect(result.current.mode).toBe('system')
    expect(result.current.resolvedMode).toBe('light')
    expect(document.documentElement).toHaveClass('sun-light')
    expect(document.documentElement).toHaveAttribute('data-color-mode', 'light')
  })

  it('migrates a legacy dark preference', () => {
    mockColorScheme(false)
    localStorage.setItem('theme', 'sun-dark')
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    expect(result.current.mode).toBe('dark')
    expect(JSON.parse(localStorage.getItem('sun-world-theme') ?? '')).toEqual({
      mode: 'dark',
    })
  })

  it('toggles color mode in one action', () => {
    mockColorScheme(false)
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    act(() => result.current.setMode('light'))
    act(() => result.current.toggleMode())

    expect(result.current.mode).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark')
    expect(document.documentElement).toHaveClass('sun-dark')
  })

  it('tracks system color changes only in system mode', () => {
    const setDark = mockColorScheme(false)
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    act(() => setDark(true))
    expect(result.current.resolvedMode).toBe('dark')

    act(() => result.current.setMode('light'))
    act(() => setDark(false))
    act(() => setDark(true))
    expect(result.current.resolvedMode).toBe('light')
  })

  it('synchronizes valid preferences from another tab', () => {
    mockColorScheme(false)
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sun-world-theme',
          newValue: JSON.stringify({ mode: 'dark' }),
        })
      )
    })

    expect(result.current.mode).toBe('dark')
  })

  it('falls back safely when storage access is rejected', () => {
    mockColorScheme(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })
    expect(result.current.mode).toBe('system')
  })
})
