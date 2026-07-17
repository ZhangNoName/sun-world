import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { render, type RenderOptions } from '@testing-library/react'

export interface RenderAppOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
}

export function renderApp(
  ui: ReactElement,
  { route = '/', ...options }: RenderAppOptions = {}
) {
  window.history.pushState({}, '', route)

  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
    ...options,
  })
}
