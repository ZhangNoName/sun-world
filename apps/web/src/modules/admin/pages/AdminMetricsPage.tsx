import { SunButton } from '@sun-world/ui/button'
import { SunLoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { useAdminMetrics } from '../composables/useAdminMetrics'
import './admin.css'

export function AdminMetricsPage() {
  const data = useAdminMetrics()
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>后台指标</h1>
          <p>请求、错误、延迟与浏览器遥测的实时快照。</p>
        </div>
        <div className="admin-actions">
          <span>
            {data.lastLoadedAt
              ? `更新于 ${data.formatDateTime(data.lastLoadedAt)}`
              : '尚未更新'}
          </span>
          <SunButton loading={data.loading} onClick={() => void data.refresh()}>
            刷新
          </SunButton>
        </div>
      </header>
      {data.errorMessage ? (
        <p className="admin-error" role="alert">
          {data.errorMessage}
        </p>
      ) : null}
      {data.loading && !data.snapshot ? (
        <SunLoadingSkeleton lines={6} />
      ) : (
        <>
          <MetricGrid
            cards={[
              ...data.alertCards,
              ...data.metricCards,
              ...data.telemetryCards,
              ...data.historyCards,
            ]}
          />
          <section className="admin-grid admin-grid--wide">
            <Panel title="活动告警" empty="暂无活动告警">
              {data.activeAlerts.map((alert) => (
                <div
                  className={`admin-row tone-${alert.severity}`}
                  key={alert.key}
                >
                  <strong>{alert.label}</strong>
                  <span>
                    {data.formatNumber(alert.actual)} {alert.unit} / 阈值{' '}
                    {data.formatNumber(alert.threshold)} {alert.unit}
                  </span>
                </div>
              ))}
            </Panel>
            <Panel title="状态码" empty="暂无状态码数据">
              {data.statuses.map((status) => (
                <div className="admin-row" key={status.status}>
                  <strong>{status.status}</strong>
                  <span>{data.formatNumber(status.count)} 次</span>
                </div>
              ))}
            </Panel>
          </section>
          <Panel title="路由延迟" empty="暂无路由指标">
            {data.routes.map((route) => (
              <div
                className="admin-row admin-row--route"
                key={`${route.method}:${route.route}`}
              >
                <strong>
                  {route.method} {route.route}
                </strong>
                <span>
                  {data.formatNumber(route.count)} 次 ·{' '}
                  {data.formatNumber(route.avg_duration_ms)}ms 平均 ·{' '}
                  {data.formatNumber(route.p95_duration_ms)}ms p95 ·{' '}
                  {route.error_count} 错误
                </span>
              </div>
            ))}
          </Panel>
          <section className="admin-grid admin-grid--wide">
            <Panel title="Web Vitals" empty="暂无浏览器性能数据">
              {data.webVitals.map((item) => (
                <div className="admin-row" key={item.metric}>
                  <strong>{item.metric}</strong>
                  <span>
                    {data.formatNumber(item.count)} 样本 · p95{' '}
                    {data.formatNumber(item.p95_value)} · {item.poor_count} poor
                  </span>
                </div>
              ))}
            </Panel>
            <Panel title="近期 RUM" empty="暂无遥测事件">
              {data.recentRumEvents.map((event, index) => (
                <div
                  className="admin-row"
                  key={`${event.name}:${event.timestamp}:${index}`}
                >
                  <strong>{event.name}</strong>
                  <span>
                    {event.page || '-'} · {event.severity}
                  </span>
                </div>
              ))}
            </Panel>
          </section>
        </>
      )}
    </main>
  )
}

function MetricGrid({
  cards,
}: {
  cards: ReturnType<typeof useAdminMetrics>['metricCards']
}) {
  return (
    <section className="metric-grid" aria-label="指标概览">
      {cards.map((card) => (
        <article className={`metric-card tone-${card.tone}`} key={card.key}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.caption}</small>
        </article>
      ))}
    </section>
  )
}
function Panel({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children)
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      {hasChildren ? children : <p className="admin-empty">{empty}</p>}
    </section>
  )
}
export default AdminMetricsPage
