import { lazy, Suspense, useState } from 'react'
import { SunLoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { SunTabs } from '@sun-world/ui/tabs'
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

export function ManagePage() {
  const [activeTab, setActiveTab] = useState<ManageTab>('blog')
  const lazyView = (node: React.ReactNode) => (
    <Suspense fallback={<SunLoadingSkeleton lines={8} />}>{node}</Suspense>
  )
  return (
    <main className="manage-page">
      <SunTabs
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
