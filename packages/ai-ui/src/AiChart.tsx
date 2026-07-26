import { useEffect, useRef } from 'react'
import type { AiJsonValue } from '@sun-world/contracts'

export default function AiChart({
  option,
  summary,
}: {
  option: Record<string, AiJsonValue>
  summary: string
}) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let chart: { dispose(): void; setOption(value: unknown): void } | undefined
    void import('echarts').then((echarts) => {
      if (disposed || !host.current) return
      chart = echarts.init(host.current)
      chart.setOption(option)
    })
    return () => {
      disposed = true
      chart?.dispose()
    }
  }, [option])

  return (
    <figure className="sw-ai-chart" aria-label={summary}>
      <div ref={host} className="sw-ai-chart-canvas" />
      <figcaption>{summary}</figcaption>
    </figure>
  )
}
