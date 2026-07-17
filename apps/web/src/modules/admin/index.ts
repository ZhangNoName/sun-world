import { lazy } from 'react'
import type { AppModule } from '../types'

const ManagePage = lazy(() => import('@/pages/manage'))
const AdminMetricsPage = lazy(() => import('./pages/AdminMetricsPage'))
const AdminLogsPage = lazy(() => import('./pages/AdminLogsPage'))

export const adminModule: AppModule = {
  id: 'admin',
  name: '管理',
  routes: [
    {
      path: '/manage',
      Component: ManagePage,
      meta: { module: 'admin', title: '管理 - Sun World', noIndex: true },
    },
    {
      path: '/manage/metrics',
      Component: AdminMetricsPage,
      meta: { module: 'admin', title: '后台指标 - Sun World', noIndex: true },
    },
    {
      path: '/manage/logs',
      Component: AdminLogsPage,
      meta: { module: 'admin', title: '审计日志 - Sun World', noIndex: true },
    },
  ],
  nav: [
    { label: 'nav.admin', path: '/manage', icon: 'admin' },
    { label: 'nav.adminMetrics', path: '/manage/metrics', icon: 'metrics' },
  ],
  seo: { title: '管理 - Sun World', noIndex: true },
}
