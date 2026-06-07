import type { AppModule } from '../types'

const ManagePage = () => import('@/pages/manage/index.vue')

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
      component: ManagePage,
      meta: { module: 'admin', title: '管理 - Sun World' },
    },
  ],
  nav: [
    { label: 'nav.admin', path: '/manage', icon: 'admin' },
  ],
  seo: {
    title: '管理 - Sun World',
    description: '查看 Sun World 后台数据、日志、指标和站点设置。',
    noIndex: true,
  },
  preload: ManagePage,
}

export * from './api'
export type * from './types'
