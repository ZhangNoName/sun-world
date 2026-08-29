import { act, renderHook } from '@testing-library/react'

import { registerRouteFallback, useRouteLoading } from './use-route-loading'

const navigation = vi.hoisted(() => ({ state: 'idle' }))

vi.mock('react-router', () => ({
  useNavigation: () => navigation,
}))

describe('route loading state', () => {
  beforeEach(() => {
    navigation.state = 'idle'
  })

  it('tracks mounted lazy-route fallbacks', () => {
    const view = renderHook(() => useRouteLoading())
    expect(view.result.current.isLoading).toBe(false)

    let unregister: () => void = () => undefined
    act(() => {
      unregister = registerRouteFallback()
    })
    expect(view.result.current.isLoading).toBe(true)

    act(() => unregister())
    expect(view.result.current.isLoading).toBe(false)
  })

  it('combines router navigation with fallback state', () => {
    navigation.state = 'loading'
    const view = renderHook(() => useRouteLoading())

    expect(view.result.current.isLoading).toBe(true)
  })
})
