/**
 * Compatibility re-export.
 *
 * The router logic has moved to `@/app/router/`. This file is kept so
 * that existing imports from `@/router` continue to work without change.
 *
 * New code should import from `@/app/router/create-router` instead.
 */

import { createAppRouter } from '@/app/router/create-router'
import { collectModuleRoutes } from '@/modules/registry'

const extraRoutes = collectModuleRoutes()
const router = createAppRouter(extraRoutes)

export default router
