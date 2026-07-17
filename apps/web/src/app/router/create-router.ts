import { createBrowserRouter } from 'react-router'

import type { AppRouteObject } from '@/modules/types'
import { routes as coreRoutes } from './routes'
import { AppLayout } from '@/layout/layout'

function isCatchAllRoute(route: AppRouteObject) {
  return route.path === '*' || route.path?.includes(':pathMatch(.*)')
}

export function mergeRoutes(
  baseRoutes: AppRouteObject[],
  moduleRoutes: AppRouteObject[]
): AppRouteObject[] {
  const seenPaths = new Set<string>()
  const fallback = baseRoutes.filter(isCatchAllRoute)
  const ordered = [
    ...baseRoutes.filter((route) => !isCatchAllRoute(route)),
    ...moduleRoutes,
    ...fallback,
  ]

  return ordered.filter((route) => {
    if (!route.path || !seenPaths.has(route.path)) {
      if (route.path) seenPaths.add(route.path)
      return true
    }
    if (import.meta.env.DEV) {
      console.warn(`[router] duplicate route path skipped: ${route.path}`)
    }
    return false
  })
}

export function createAppRouter(extraRoutes: AppRouteObject[] = []) {
  const routes = mergeRoutes(coreRoutes, extraRoutes).map((route) => ({
    ...route,
    handle: { ...(route.handle ?? {}), meta: route.meta ?? {} },
  }))
  return createBrowserRouter([
    { path: '/', Component: AppLayout, children: routes },
  ])
}
