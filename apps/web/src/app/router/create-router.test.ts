import type { RouteObject } from 'react-router'

import { mergeRoutes } from './create-router'

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
})
