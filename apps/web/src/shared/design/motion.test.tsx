import { act, renderHook } from '@testing-library/react'

import {
  ROUTE_PENDING_DELAY_MS,
  ROUTE_PENDING_MIN_VISIBLE_MS,
  useReducedMotion,
} from './motion'

function mockReducedMotion(initial = false) {
  let matches = initial
  const listeners = new Set<() => void>()
  const removeEventListener = vi.fn((_type: 'change', listener: () => void) =>
    listeners.delete(listener)
  )

  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      ({
        get matches() {
          return matches
        },
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: (_type: 'change', listener: () => void) => {
          listeners.add(listener)
        },
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  )

  return {
    removeEventListener,
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe('motion preferences', () => {
  it('tracks reduced-motion changes and removes its listener', () => {
    const media = mockReducedMotion()
    const view = renderHook(() => useReducedMotion())

    expect(view.result.current).toBe(false)
    act(() => media.setMatches(true))
    expect(view.result.current).toBe(true)

    view.unmount()
    expect(media.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  it('uses a short pending threshold and a stable minimum display window', () => {
    expect(ROUTE_PENDING_DELAY_MS).toBe(150)
    expect(ROUTE_PENDING_MIN_VISIBLE_MS).toBe(180)
  })
})
