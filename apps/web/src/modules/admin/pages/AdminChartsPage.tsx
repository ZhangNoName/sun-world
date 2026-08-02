import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'

import { SwButton as Button } from '@sun-world/ui/sw-button'
import { LoadingSkeleton } from '@sun-world/ui/loading-skeleton'

import { useAdminMetrics } from '../composables/useAdminMetrics'
import { useManageCopy } from '../manageCopy'
import { ChartsCard } from '../ui/ChartsCard'
import './admin.css'

export function AdminChartsPage() {
  const copy = useManageCopy()
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
          name: copy.overview.averageDuration,
          type: 'bar',
          data: data.routes.map((route) => route.avg_duration_ms),
        },
      ],
    }),
    [copy.overview.averageDuration, data.routes]
  )

  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">{copy.overview.eyebrow}</p>
          <h1>{copy.overview.title}</h1>
          <p>{copy.overview.description}</p>
        </div>
      </header>
      {data.errorMessage && data.snapshot ? (
        <p className="admin-error" role="alert">
          {data.errorMessage}
        </p>
      ) : null}
      {data.errorMessage && !data.snapshot ? (
        <section className="admin-error-state">
          <p className="admin-error" role="alert">
            {data.errorMessage}
          </p>
          <Button loading={data.loading} onClick={() => void data.refresh()}>
            {copy.overview.retry}
          </Button>
        </section>
      ) : data.loading && !data.snapshot ? (
        <LoadingSkeleton lines={5} />
      ) : !data.routes.length ? (
        <p className="admin-empty">{copy.overview.empty}</p>
      ) : (
        <ChartsCard options={options} />
      )}
    </main>
  )
}

export default AdminChartsPage
