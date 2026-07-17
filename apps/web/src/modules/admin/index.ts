import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

export const adminModule: AppModule = {
  id: 'admin',
  name: '管理',
  routes: [
    {
      path: '/manage',
      Component: createPendingRouteComponent('管理'),
      meta: { module: 'admin', title: '管理 - Sun World' },
    },
    {
      path: '/manage/metrics',
      Component: createPendingRouteComponent('后台指标'),
      meta: { module: 'admin', title: '后台指标 - Sun World' },
    },
    {
      path: '/manage/logs',
      Component: createPendingRouteComponent('审计日志'),
      meta: { module: 'admin', title: '审计日志 - Sun World', noIndex: true },
    },
  ],
  nav: [
    { label: 'nav.admin', path: '/manage', icon: 'admin' },
    { label: 'nav.adminMetrics', path: '/manage/metrics', icon: 'metrics' },
  ],
  seo: { title: '管理 - Sun World', noIndex: true },
}
