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
  it('defaults to the Sun World family and system color mode', () => {
    mockColorScheme(false)
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    expect(result.current.family).toBe('sun-world')
    expect(result.current.mode).toBe('system')
    expect(result.current.resolvedMode).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-design', 'sun-world')
    expect(document.documentElement).toHaveClass('sun-light')
  })

  it('migrates a legacy dark preference', () => {
    mockColorScheme(false)
    localStorage.setItem('theme', 'sun-dark')
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    expect(result.current.family).toBe('sun-world')
    expect(result.current.mode).toBe('dark')
    expect(JSON.parse(localStorage.getItem('sun-world-theme') ?? '')).toEqual({
      family: 'sun-world',
      mode: 'dark',
    })
  })

  it('switches design family in one action without changing color mode', () => {
    mockColorScheme(false)
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })

    act(() => result.current.setMode('dark'))
    act(() => result.current.toggleFamily())

    expect(result.current.family).toBe('apple')
    expect(result.current.mode).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-design', 'apple')
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
          newValue: JSON.stringify({ family: 'apple', mode: 'dark' }),
        })
      )
    })

    expect(result.current.family).toBe('apple')
    expect(result.current.mode).toBe('dark')
  })

  it('falls back safely when storage access is rejected', () => {
    mockColorScheme(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider })
    expect(result.current.family).toBe('sun-world')
    expect(result.current.mode).toBe('system')
  })
})
