import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { TabsView } from '@sun-world/ui/compound-controls'
import { useAuthStore } from '@/store/auth'
import ManageBlogPage from './blog'
import ManageAigcPage from './aigc'
import './manage.css'

const AdminChartsPage = lazy(
  () => import('@/modules/admin/pages/AdminChartsPage')
)
const AdminMetricsPage = lazy(
  () => import('@/modules/admin/pages/AdminMetricsPage')
)
const AdminLogsPage = lazy(() => import('@/modules/admin/pages/AdminLogsPage'))
type ManageTab = 'overview' | 'blog' | 'aigc' | 'metrics' | 'logs'

export function hasAdminRole(
  user: { roles?: Array<{ code?: string | null }> } | null
) {
  return Boolean(
    user?.roles?.some((role) => role.code?.trim().toLowerCase() === 'admin')
  )
}

export function ManagePage() {
  const user = useAuthStore((state) => state.user)
  const getUser = useAuthStore((state) => state.getUser)
  const [authState, setAuthState] = useState<
    'checking' | 'authorized' | 'unauthorized' | 'forbidden'
  >(hasAdminRole(user) ? 'authorized' : 'checking')
  const [activeTab, setActiveTab] = useState<ManageTab>('blog')

  useEffect(() => {
    let active = true
    if (user) {
      setAuthState(hasAdminRole(user) ? 'authorized' : 'forbidden')
      return () => {
        active = false
      }
    }
    void getUser().then((restored) => {
      if (active)
        setAuthState(
          restored
            ? hasAdminRole(restored)
              ? 'authorized'
              : 'forbidden'
            : 'unauthorized'
        )
    })
    return () => {
      active = false
    }
  }, [getUser, user])

  if (authState === 'checking') {
    return (
      <main className="manage-page">
        <p role="status">正在验证管理权限…</p>
      </main>
    )
  }
  if (authState === 'unauthorized') {
    return (
      <main className="manage-page manage-state">
        <h1>需要登录</h1>
        <p role="alert">登录后才能访问管理中心。</p>
        <Link className="manage-link" to="/login">
          去登录
        </Link>
      </main>
    )
  }
  if (authState === 'forbidden') {
    return (
      <main className="manage-page manage-state">
        <h1>没有管理权限</h1>
        <p role="alert">当前账号不是管理员，无法访问管理中心。</p>
      </main>
    )
  }
  const lazyView = (node: React.ReactNode) => (
    <Suspense fallback={<LoadingSkeleton lines={8} />}>{node}</Suspense>
  )
  return (
    <main className="manage-page">
      <TabsView
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ManageTab)}
        items={[
          {
            value: 'overview',
            label: '首页',
            content: lazyView(<AdminChartsPage />),
          },
          { value: 'blog', label: '博客管理', content: <ManageBlogPage /> },
          { value: 'aigc', label: 'AIGC', content: <ManageAigcPage /> },
          {
            value: 'metrics',
            label: '请求指标',
            content: lazyView(<AdminMetricsPage />),
          },
          {
            value: 'logs',
            label: '审计日志',
            content: lazyView(<AdminLogsPage />),
          },
        ]}
      />
    </main>
  )
}
export default ManagePage
