import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { render, type RenderOptions } from '@testing-library/react'

import { AppProviders } from '@/app/providers/AppProviders'

export interface RenderAppOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
}

export function renderApp(
  ui: ReactElement,
  { route = '/', ...options }: RenderAppOptions = {}
) {
  const router = createMemoryRouter([{ path: '*', element: ui }], {
    initialEntries: [route],
  })
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
    options
  )

  return { ...result, router }
}
