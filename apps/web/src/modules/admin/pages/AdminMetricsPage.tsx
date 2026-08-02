import type { ReactNode } from 'react'

import { SwButton as Button } from '@sun-world/ui/sw-button'
import { LoadingSkeleton } from '@sun-world/ui/loading-skeleton'

import { useAdminMetrics } from '../composables/useAdminMetrics'
import { useManageCopy } from '../manageCopy'
import './admin.css'

export function AdminMetricsPage() {
  const copy = useManageCopy()
  const data = useAdminMetrics()
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">{copy.metrics.eyebrow}</p>
          <h1>{copy.metrics.title}</h1>
          <p>{copy.metrics.description}</p>
        </div>
        <div className="admin-actions">
          <span>
            {data.lastLoadedAt
              ? copy.metrics.updated(data.formatDateTime(data.lastLoadedAt))
              : copy.metrics.notLoaded}
          </span>
          <Button loading={data.loading} onClick={() => void data.refresh()}>
            {copy.metrics.refresh}
          </Button>
        </div>
      </header>
      {data.errorMessage && data.snapshot ? (
        <p className="admin-error" role="alert">
          {data.errorMessage}
        </p>
      ) : null}
      {data.errorMessage && !data.snapshot ? (
        <AdminFailure
          message={data.errorMessage}
          onRetry={data.refresh}
          loading={data.loading}
        />
      ) : data.loading && !data.snapshot ? (
        <LoadingSkeleton lines={6} />
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
            <Panel
              title={copy.metrics.activeAlerts}
              empty={copy.metrics.noActiveAlerts}
            >
              {data.activeAlerts.map((alert) => (
                <div
                  className={`admin-row tone-${alert.severity}`}
                  key={alert.key}
                >
                  <strong>{alert.label}</strong>
                  <span>
                    {data.formatNumber(alert.actual)} {alert.unit} /{' '}
                    {copy.metrics.threshold}{' '}
                    {data.formatNumber(alert.threshold)} {alert.unit}
                  </span>
                </div>
              ))}
            </Panel>
            <Panel
              title={copy.metrics.statusCodes}
              empty={copy.metrics.noStatusData}
            >
              {data.statuses.map((status) => (
                <div className="admin-row" key={status.status}>
                  <strong>{status.status}</strong>
                  <span>
                    {data.formatNumber(status.count)} {copy.metrics.requests}
                  </span>
                </div>
              ))}
            </Panel>
          </section>
          <Panel
            title={copy.metrics.routeLatency}
            empty={copy.metrics.noRouteMetrics}
          >
            {data.routes.map((route) => (
              <div
                className="admin-row admin-row--route"
                key={`${route.method}:${route.route}`}
              >
                <strong>
                  {route.method} {route.route}
                </strong>
                <span>
                  {data.formatNumber(route.count)} {copy.metrics.requests} ·{' '}
                  {data.formatNumber(route.avg_duration_ms)}ms{' '}
                  {copy.metrics.average} ·{' '}
                  {data.formatNumber(route.p95_duration_ms)}ms p95 ·{' '}
                  {route.error_count} {copy.metrics.errors}
                </span>
              </div>
            ))}
          </Panel>
          <section className="admin-grid admin-grid--wide">
            <Panel
              title={copy.metrics.webVitals}
              empty={copy.metrics.noBrowserPerformance}
            >
              {data.webVitals.map((item) => (
                <div className="admin-row" key={item.metric}>
                  <strong>{item.metric}</strong>
                  <span>
                    {data.formatNumber(item.count)} {copy.metrics.samples} · p95{' '}
                    {data.formatNumber(item.p95_value)} · {item.poor_count}{' '}
                    {copy.metrics.poor}
                  </span>
                </div>
              ))}
            </Panel>
            <Panel
              title={copy.metrics.recentRum}
              empty={copy.metrics.noRecentEvents}
            >
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

function AdminFailure({
  message,
  onRetry,
  loading,
}: {
  message: string
  onRetry: () => Promise<void>
  loading: boolean
}) {
  const copy = useManageCopy()
  return (
    <section className="admin-error-state">
      <p className="admin-error" role="alert">
        {message}
      </p>
      <Button loading={loading} onClick={() => void onRetry()}>
        {copy.metrics.refresh}
      </Button>
    </section>
  )
}

function MetricGrid({
  cards,
}: {
  cards: ReturnType<typeof useAdminMetrics>['metricCards']
}) {
  const copy = useManageCopy()
  return (
    <section className="metric-grid" aria-label={copy.metrics.metricsOverview}>
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
  children?: ReactNode
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
