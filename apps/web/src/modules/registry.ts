import { matchRoutes } from 'react-router'

import { accountModule } from './account'
import { adminModule } from './admin'
import { aiModule } from './ai'
import { blogModule } from './blog'
import { editorModule } from './editor'
import { homeModule } from './home'
import type { AppModule, AppRouteObject, RouteMeta } from './types'
import { videoModule } from './video'

export const appModules: AppModule[] = [
  homeModule,
  blogModule,
  aiModule,
  editorModule,
  accountModule,
  adminModule,
  videoModule,
]

const moduleById = new Map(appModules.map((module) => [module.id, module]))
const preloadPromises = new Map<string, Promise<unknown>>()

function applyDefaults(
  route: AppRouteObject,
  module: AppModule
): AppRouteObject {
  const current = route.meta ?? {}
  const meta: RouteMeta = {
    ...current,
    module: typeof current.module === 'string' ? current.module : module.id,
    title: current.title ?? module.seo?.title,
    description: current.description ?? module.seo?.description,
    ogType: current.ogType ?? module.seo?.ogType,
    noIndex: current.noIndex ?? module.seo?.noIndex,
  }
  return {
    ...route,
    meta,
    handle: { ...(route.handle ?? {}), meta },
    children: route.children?.map((child) => applyDefaults(child, module)),
  } as AppRouteObject
}

export function collectModuleRoutes(): AppRouteObject[] {
  return appModules.flatMap((module) =>
    module.routes.map((route) => applyDefaults(route, module))
  )
}

export function preloadModuleById(moduleId: string) {
  const module = moduleById.get(moduleId)
  if (!module?.preload) return undefined
  const existing = preloadPromises.get(moduleId)
  if (existing) return existing
  const promise = Promise.resolve()
    .then(module.preload)
    .catch(() => {
      preloadPromises.delete(moduleId)
      return undefined
    })
  preloadPromises.set(moduleId, promise)
  return promise
}

interface SubscribableRouter {
  state: { location: { pathname: string } }
  subscribe: (listener: () => void) => () => void
}

export function installModulePreloading(
  router: SubscribableRouter,
  options: { idleModules?: string[] } = {}
) {
  const preloadLocation = () => {
    const matches = matchRoutes(collectModuleRoutes(), router.state.location)
    const ids = new Set(
      matches
        ?.map((match) => match.route.meta?.module)
        .filter((id): id is string => typeof id === 'string') ?? []
    )
    ids.forEach(preloadModuleById)
  }
  const unsubscribe = router.subscribe(preloadLocation)
  const timer = window.setTimeout(() => {
    ;(options.idleModules ?? ['blog']).forEach(preloadModuleById)
  }, 1200)
  return () => {
    unsubscribe()
    window.clearTimeout(timer)
  }
}
