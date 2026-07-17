import type { RouteObject } from 'react-router'

export interface RouteMeta extends Record<string, unknown> {
  module?: string
  title?: string
  description?: string
  canonical?: string
  ogImage?: string
  ogType?: string
  noIndex?: boolean
  hideHeader?: boolean
  hideFooter?: boolean
  className?: string
}

export type AppRouteObject = RouteObject & {
  meta?: RouteMeta
  children?: AppRouteObject[]
}

export interface ModuleSeoDefaults {
  title?: string
  description?: string
  ogType?: string
  noIndex?: boolean
}

export interface ModuleNavItem {
  label: string
  path: string
  icon?: string
  children?: ModuleNavItem[]
}

export interface AppModule {
  id: string
  name: string
  routes: AppRouteObject[]
  nav?: ModuleNavItem[]
  seo?: ModuleSeoDefaults
  preload?: () => Promise<unknown>
}
