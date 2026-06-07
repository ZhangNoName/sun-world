import type { AppModule } from './types'
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

/**
 * Collect all route definitions from registered modules.
 */
export function collectModuleRoutes() {
  return appModules.flatMap((m) => m.routes)
}
