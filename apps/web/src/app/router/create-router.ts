import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { routes as coreRoutes } from './routes'

function mergeRoutes(
  baseRoutes: RouteRecordRaw[],
  moduleRoutes: RouteRecordRaw[]
): RouteRecordRaw[] {
  const seenPaths = new Set<string>()
  const merged: RouteRecordRaw[] = []
  const baseCatchAllRoutes = baseRoutes.filter(isCatchAllRoute)
  const baseRoutesBeforeFallback = baseRoutes.filter(
    (route) => !isCatchAllRoute(route)
  )

  for (const route of [
    ...baseRoutesBeforeFallback,
    ...moduleRoutes,
    ...baseCatchAllRoutes,
  ]) {
    if (seenPaths.has(route.path)) {
      if (import.meta.env.DEV) {
        console.warn(`[router] duplicate route path skipped: ${route.path}`)
      }
      continue
    }

    seenPaths.add(route.path)
    merged.push(route)
  }

  return merged
}

function isCatchAllRoute(route: RouteRecordRaw): boolean {
  return route.path.includes(':pathMatch(.*)')
}

/**
 * Create the Vue Router instance.
 *
 * Accepts optional additional routes from module manifests so that
 * future feature modules can register their own routes without
 * editing the core route list.
 */
export function createAppRouter(extraRoutes: RouteRecordRaw[] = []) {
  const allRoutes = mergeRoutes(coreRoutes, extraRoutes)

  const router = createRouter({
    history: createWebHistory(),
    routes: allRoutes,
    scrollBehavior(to, from, savedPosition) {
      if (savedPosition) return savedPosition
      return { top: 0 }
    },
  })

  return router
}
