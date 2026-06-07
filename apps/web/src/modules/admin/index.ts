import type { AppModule } from '../types'

/**
 * Admin module - analytics, logs, settings dashboard.
 *
 * Registers the existing manage page and typed admin API entrypoints.
 * Dashboard views can consume the module API without reaching into
 * legacy service folders.
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

export * from './api'
export type * from './types'
