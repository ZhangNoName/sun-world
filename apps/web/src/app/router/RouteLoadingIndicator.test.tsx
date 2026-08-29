import { act, render, screen } from '@testing-library/react'

import {
  RouteLoadingFallback,
  RouteLoadingIndicator,
} from './RouteLoadingIndicator'

const routeState = vi.hoisted(() => ({ isLoading: false }))

vi.mock('./use-route-loading', () => ({
  registerRouteFallback: () => () => undefined,
  useRouteLoading: () => routeState,
}))

describe('route loading feedback', () => {
  beforeEach(() => {
    routeState.isLoading = false
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('suppresses fast navigations', () => {
    const view = render(<RouteLoadingIndicator label="正在加载页面" />)

    routeState.isLoading = true
    view.rerender(<RouteLoadingIndicator label="正在加载页面" />)
    act(() => vi.advanceTimersByTime(100))
    routeState.isLoading = false
    view.rerender(<RouteLoadingIndicator label="正在加载页面" />)
    act(() => vi.runAllTimers())

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps a visible indicator stable long enough to avoid a flash', () => {
    const view = render(<RouteLoadingIndicator label="正在加载页面" />)

    routeState.isLoading = true
    view.rerender(<RouteLoadingIndicator label="正在加载页面" />)
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('status', { name: '正在加载页面' })).toBeVisible()

    routeState.isLoading = false
    view.rerender(<RouteLoadingIndicator label="正在加载页面" />)
    act(() => vi.advanceTimersByTime(179))
    expect(screen.getByRole('status')).toBeVisible()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders an immediate, meaningful fallback for a cold route', () => {
    render(<RouteLoadingFallback label="正在加载页面" />)

    expect(
      screen.getByRole('status', { name: '正在加载页面' })
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByTestId('sun-skeleton-line')).toHaveLength(6)
  })
})
