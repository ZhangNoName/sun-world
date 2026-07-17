import { act, renderHook } from '@testing-library/react'

import { useViewportWidth } from './viewport'

describe('useViewportWidth', () => {
  it('subscribes to viewport changes and unsubscribes on unmount', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 640,
    })
    const remove = vi.spyOn(window, 'removeEventListener')
    const view = renderHook(() => useViewportWidth())
    expect(view.result.current).toBe(640)

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 900,
    })
    act(() => window.dispatchEvent(new Event('resize')))
    expect(view.result.current).toBe(900)

    view.unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
