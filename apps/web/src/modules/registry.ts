import type { AppModule } from './types'
import type {
  RouteMeta,
  RouteLocationNormalizedLoaded,
  RouteRecordRaw,
  Router,
} from 'vue-router'
import { blogModule } from './blog'
import { aiModule } from './ai'
import { editorModule } from './editor'
import { accountModule } from './account'
import { adminModule } from './admin'

/**
 * Central module registry.
 *
 * Every feature module is registered here. The app bootstrap reads
 * this list to assemble routes, navigation, and SEO defaults.
 *
 * To add a new module:
 * 1. Create a folder under `modules/<id>/`
 * 2. Export an `AppModule` manifest
 * 3. Import and add it to the array below
 */
export const appModules: AppModule[] = [
  blogModule,
  aiModule,
  editorModule,
  accountModule,
  adminModule,
]

const appModulesById = new Map(appModules.map((module) => [module.id, module]))
const preloadPromises = new Map<string, Promise<unknown>>()

/**
 * Collect all route definitions from registered modules.
 *
 * Module SEO defaults are applied here so route-level metadata has a single
 * authoritative shape before it reaches the router and head manager.
 */
export function collectModuleRoutes(): RouteRecordRaw[] {
  return appModules.flatMap((module) =>
    module.routes.map((route) => applyModuleRouteDefaults(route, module))
  )
}

function applyModuleRouteDefaults(
  route: RouteRecordRaw,
  module: AppModule
): RouteRecordRaw {
  const currentMeta = route.meta ?? {}
  const seo = module.seo ?? {}
  const moduleId =
    typeof currentMeta.module === 'string' ? currentMeta.module : module.id

  const meta = {
    ...currentMeta,
    module: moduleId,
    title: stringMeta(currentMeta, 'title') ?? seo.title,
    description: stringMeta(currentMeta, 'description') ?? seo.description,
    ogType: stringMeta(currentMeta, 'ogType') ?? seo.ogType,
    noIndex: booleanMeta(currentMeta, 'noIndex') ?? seo.noIndex,
  }

  const normalizedRoute = {
    ...route,
    meta,
  }

  if (route.children) {
    normalizedRoute.children = route.children.map((child) =>
      applyModuleRouteDefaults(child, module)
    )
  }

  return normalizedRoute as RouteRecordRaw
}

function stringMeta(meta: RouteMeta, key: string): string | undefined {
  const value = meta[key]
  return typeof value === 'string' ? value : undefined
}

function booleanMeta(meta: RouteMeta, key: string): boolean | undefined {
  const value = meta[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Preload a module's declared async resources.
 *
 * The promise is memoized so repeated route visits do not re-trigger work.
 */
export function preloadModuleById(moduleId: string): Promise<unknown> | undefined {
  const module = appModulesById.get(moduleId)
  if (!module?.preload) return undefined

  const existing = preloadPromises.get(moduleId)
  if (existing) return existing

  const preloadPromise = Promise.resolve()
    .then(() => module.preload?.())
    .catch((error) => {
      preloadPromises.delete(moduleId)
      if (import.meta.env.DEV) {
        console.warn(`[modules] failed to preload module: ${moduleId}`, error)
      }
      return undefined
    })

  preloadPromises.set(moduleId, preloadPromise)
  return preloadPromise
}

function preloadMatchedRouteModules(route: RouteLocationNormalizedLoaded) {
  const moduleIds = new Set(
    route.matched
      .map((record) => record.meta.module)
      .filter((value): value is string => typeof value === 'string')
  )

  for (const moduleId of moduleIds) {
    preloadModuleById(moduleId)
  }
}

function scheduleIdlePreload(callback: () => void) {
  const requestIdle = window.requestIdleCallback

  if (requestIdle) {
    requestIdle(callback, { timeout: 2500 })
    return
  }

  setTimeout(callback, 1200)
}

/**
 * Install route-aware module preloading.
 *
 * Preloading starts navigation-adjacent but does not block navigation. The
 * homepage/blog module is also warmed during idle time because it is the most
 * likely next interaction from the public shell.
 */
export function installModulePreloading(
  router: Router,
  options: { idleModules?: string[] } = {}
) {
  const idleModules = options.idleModules ?? ['blog']

  router.beforeResolve((to) => {
    preloadMatchedRouteModules(to)
  })

  scheduleIdlePreload(() => {
    for (const moduleId of idleModules) {
      preloadModuleById(moduleId)
    }
  })
}
