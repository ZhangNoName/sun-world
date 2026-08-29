import { act, render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { I18nextProvider } from 'react-i18next'

import i18n from '@/i18n'
import { ThemeProvider } from '@/shared/design/theme'
import { createAppRouter } from './create-router'

describe('initial lazy-route loading', () => {
  let router: ReturnType<typeof createAppRouter> | undefined
  const NativeRequest = globalThis.Request

  beforeEach(() => {
    class CrossRealmSafeRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        // jsdom and undici expose different AbortSignal realms. The production
        // browser has one realm; omit only the incompatible test signal.
        super(input, init ? { ...init, signal: undefined } : undefined)
      }
    }

    vi.stubGlobal('Request', CrossRealmSafeRequest)
  })

  afterEach(() => {
    router?.dispose()
    router = undefined
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('renders the root skeleton until the initial route module resolves', async () => {
    let resolveLazy!: (module: { Component: () => React.JSX.Element }) => void
    const lazyModule = new Promise<{
      Component: () => React.JSX.Element
    }>((resolve) => {
      resolveLazy = resolve
    })

    window.history.replaceState(null, '', '/initial-lazy-route-test')
    router = createAppRouter([
      {
        path: '/initial-lazy-route-test',
        lazy: () => lazyModule,
      },
    ])

    render(
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </I18nextProvider>
    )

    expect(
      screen.getByRole('status', { name: /正在加载页面/ })
    ).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      resolveLazy({ Component: () => <main>初始路由已加载</main> })
      await lazyModule
    })

    expect(await screen.findByText('初始路由已加载')).toBeVisible()
  })
})
