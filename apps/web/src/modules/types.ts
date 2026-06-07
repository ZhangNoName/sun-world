import type { RouteRecordRaw } from 'vue-router'

/**
 * SEO defaults a module can contribute for all its routes.
 */
export interface ModuleSeoDefaults {
  /** Fallback title suffix, e.g. " - Sun World" */
  title?: string
  /** Fallback description for module pages */
  description?: string
  /** Fallback Open Graph type */
  ogType?: string
  /** Whether module pages should be excluded from indexing by default */
  noIndex?: boolean
}

/**
 * A single navigation item contributed by a module.
 */
export interface ModuleNavItem {
  /** Display label (localized key or literal) */
  label: string
  /** Route path */
  path: string
  /** Optional icon identifier */
  icon?: string
  /** Nested nav items */
  children?: ModuleNavItem[]
}

/**
 * Contract every feature module must fulfil.
 */
export interface AppModule {
  /** Unique module identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Vue Router route definitions */
  routes: RouteRecordRaw[]
  /** Optional navigation items for the app shell */
  nav?: ModuleNavItem[]
  /** Optional SEO defaults */
  seo?: ModuleSeoDefaults
  /** Optional preload hook (called lazily before first route enter) */
  preload?: () => Promise<unknown>
}
