import { createElement, lazy } from 'react'
import { Navigate } from 'react-router'

import type { AppModule } from '../types'

const AdminChartsPage = lazy(() => import('./pages/AdminChartsPage'))
const AdminMetricsPage = lazy(() => import('./pages/AdminMetricsPage'))
const ManageLogsDataPage = lazy(() => import('./pages/ManageLogsDataPage'))
const ManageBlogPage = lazy(() => import('./pages/ManageBlogDataPage'))
const ManageAigcPage = lazy(() => import('./pages/ManageProvidersDataPage'))
const ManageDictionariesPage = lazy(
  () => import('./pages/ManageDictionariesPage')
)

function redirect(to: string) {
  return createElement(Navigate, { to, replace: true })
}

export const adminModule: AppModule = {
  id: 'admin',
  name: 'Manage',
  routes: [
    {
      path: '/manage',
      Component: AdminChartsPage,
      meta: { module: 'admin', title: '管理 - Sun World', noIndex: true },
    },
    {
      path: '/manage/metrics',
      Component: AdminMetricsPage,
      meta: {
        module: 'admin',
        title: '请求指标 - Sun World',
        noIndex: true,
      },
    },
    {
      path: '/manage/content/blog',
      Component: ManageBlogPage,
      meta: {
        module: 'admin',
        title: '博客管理 - Sun World',
        noIndex: true,
      },
    },
    {
      path: '/manage/ai/providers',
      Component: ManageAigcPage,
      meta: {
        module: 'admin',
        title: 'AI 供应商 - Sun World',
        noIndex: true,
      },
    },
    {
      path: '/manage/system/dictionaries',
      Component: ManageDictionariesPage,
      meta: {
        module: 'admin',
        title: '字典管理 - Sun World',
        noIndex: true,
      },
    },
    {
      path: '/manage/system/logs',
      Component: ManageLogsDataPage,
      meta: { module: 'admin', title: '审计日志 - Sun World', noIndex: true },
    },
    {
      path: '/manage/blog',
      Component: () => redirect('/manage/content/blog'),
      meta: { noIndex: true },
    },
    {
      path: '/manage/aigc',
      Component: () => redirect('/manage/ai/providers'),
      meta: { noIndex: true },
    },
    {
      path: '/manage/logs',
      Component: () => redirect('/manage/system/logs'),
      meta: { noIndex: true },
    },
  ],
  nav: [{ label: 'nav.admin', path: '/manage', icon: 'settings' }],
  seo: { title: '管理 - Sun World', noIndex: true },
}
