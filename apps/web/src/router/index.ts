import { createAppRouter } from '@/app/router/create-router'
import { collectModuleRoutes } from '@/modules/registry'

const router = createAppRouter(collectModuleRoutes())

export default router
