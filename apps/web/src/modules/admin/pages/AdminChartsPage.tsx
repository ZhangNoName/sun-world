import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useAdminMetrics } from '../composables/useAdminMetrics'
import { ChartsCard } from '../ui/ChartsCard'
import './admin.css'

export function AdminChartsPage() {
  const data = useAdminMetrics()
  const options = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: data.routes.map((route) => route.route),
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '平均耗时',
          type: 'bar',
          data: data.routes.map((route) => route.avg_duration_ms),
        },
      ],
    }),
    [data.routes]
  )
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>运行概览</h1>
          <p>按路由比较平均请求耗时。</p>
        </div>
      </header>
      {data.errorMessage ? (
        <p className="admin-error">{data.errorMessage}</p>
      ) : null}
      <ChartsCard options={options} />
    </main>
  )
}
export default AdminChartsPage
