import type { RouteObject } from 'react-router'

import type { Contribution } from '@/shared/extensions'
import type { AiToolsContext } from './ai/extension-contract'

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
  version?: string
  dependencies?: readonly { id: string; version: string }[]
  contributions?: readonly Contribution<AiToolsContext>[]
  routes: AppRouteObject[]
  nav?: ModuleNavItem[]
  seo?: ModuleSeoDefaults
  preload?: () => Promise<unknown>
}
