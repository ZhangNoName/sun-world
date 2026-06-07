import type { AppModule } from '../types'

/**
 * Admin module - analytics, logs, settings dashboard.
 *
 * Phase 1 registers the existing manage page.
 * Future phases will add analytics dashboards, log investigation,
 * and system settings.
 */
export const adminModule: AppModule = {
  id: 'admin',
  name: '管理',
  routes: [
    {
      path: '/manage',
      component: () => import('@/pages/manage/index.vue'),
      meta: { module: 'admin', title: '管理 - Sun World' },
    },
  ],
  nav: [
    { label: 'nav.admin', path: '/manage', icon: 'admin' },
  ],
  seo: {
    title: '管理 - Sun World',
  },
}
