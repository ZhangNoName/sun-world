import type { AppModule } from '../types'

const ManagePage = () => import('@/pages/manage/index.vue')
const AdminMetricsPage = () => import('./pages/AdminMetricsPage.vue')

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
    {
      path: '/manage/metrics',
      component: AdminMetricsPage,
      meta: {
        module: 'admin',
        title: '后台指标 - Sun World',
        description: '查看 Sun World 请求量、错误率、路由延迟和状态码分布。',
      },
    },
  ],
  nav: [
    { label: 'nav.admin', path: '/manage', icon: 'admin' },
    { label: 'nav.adminMetrics', path: '/manage/metrics', icon: 'metrics' },
  ],
  seo: {
    title: '管理 - Sun World',
    description: '查看 Sun World 后台数据、日志、指标和站点设置。',
    noIndex: true,
  },
}
