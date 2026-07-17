import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import type { EChartsType } from 'echarts/core'

export function ChartsCard({ options }: { options: EChartsOption }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let chart: EChartsType | undefined
    let disposed = false
    void Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
    ]).then(([core, charts, components, renderers]) => {
      if (disposed || !host.current) return
      core.use([
        charts.LineChart,
        charts.BarChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        renderers.CanvasRenderer,
      ])
      const instance = core.init(host.current)
      instance.setOption(options)
      chart = instance
    })
    return () => {
      disposed = true
      chart?.dispose()
    }
  }, [options])
  return (
    <div className="chart-card" ref={host} role="img" aria-label="指标趋势图" />
  )
}
