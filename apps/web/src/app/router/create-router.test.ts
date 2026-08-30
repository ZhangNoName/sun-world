import type { RouteObject } from 'react-router'

import { mergeRoutes } from './create-router'
import { routes as coreRoutes } from './routes'

describe('mergeRoutes', () => {
  it('keeps the catch-all after module routes and skips duplicate paths', () => {
    const core: RouteObject[] = [
      { path: '/tools' },
      { path: '*', id: 'not-found' },
    ]
    const modules: RouteObject[] = [
      { path: '/', id: 'home' },
      { path: '/tools', id: 'duplicate' },
    ]

    const merged = mergeRoutes(core, modules)

    expect(merged.map((route) => route.path)).toEqual(['/tools', '/', '*'])
    expect(merged.at(-1)?.id).toBe('not-found')
  })

  it('registers the public privacy policy with canonical metadata', () => {
    const privacyRoute = coreRoutes.find((route) => route.path === '/privacy')

    expect(privacyRoute?.Component).toBeDefined()
    expect(privacyRoute?.meta).toMatchObject({
      title: '隐私政策 - Sun World',
      canonical: 'https://sunworld.site/privacy',
    })
    expect(privacyRoute?.meta?.noIndex).not.toBe(true)
  })
})
