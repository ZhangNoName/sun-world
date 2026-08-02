import { SwInput } from '@sun-world/ui/sw-input'
import { SwSelect } from '@sun-world/ui/sw-select'
import { SwButton as Button } from '@sun-world/ui/sw-button'
import {
  useAdminLogs,
  type AdminLogSeverity,
} from '../composables/useAdminLogs'
import { useManageCopy } from '../manageCopy'
import './admin.css'

export function AdminLogsPage() {
  const copy = useManageCopy()
  const logs = useAdminLogs()
  const severityOptions = [
    { value: 'all', label: copy.logs.allLevels },
    { value: 'debug', label: copy.logs.severityLabels.debug },
    { value: 'info', label: copy.logs.severityLabels.info },
    { value: 'warning', label: copy.logs.severityLabels.warning },
    { value: 'error', label: copy.logs.severityLabels.error },
    { value: 'critical', label: copy.logs.severityLabels.critical },
  ]
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">{copy.logs.eyebrow}</p>
          <h1>{copy.logs.title}</h1>
          <p>{copy.logs.description}</p>
        </div>
        <Button loading={logs.loading} onClick={() => void logs.refresh()}>
          {copy.logs.refresh}
        </Button>
      </header>
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault()
          void logs.refresh()
        }}
      >
        <SwSelect
          label={copy.logs.level}
          value={logs.severity || 'all'}
          options={severityOptions}
          onValueChange={(value) =>
            logs.setSeverity(value === 'all' ? '' : (value as AdminLogSeverity))
          }
        />
        <SwInput
          label={copy.logs.eventType}
          value={logs.eventType}
          onValueChange={logs.setEventType}
          placeholder={copy.logs.eventPlaceholder}
        />
        <SwInput
          label={copy.logs.count}
          type="number"
          min={1}
          max={200}
          value={String(logs.limit)}
          onValueChange={(value) => logs.setLimit(Number(value))}
        />
        <Button type="submit" variant="secondary">
          {copy.logs.applyFilters}
        </Button>
      </form>
      {logs.retentionCopy ? (
        <p className="retention-summary">{logs.retentionCopy}</p>
      ) : null}
      {logs.errorMessage && logs.snapshot ? (
        <p className="admin-error" role="alert">
          {logs.errorMessage}
        </p>
      ) : null}
      {logs.errorMessage && !logs.snapshot ? (
        <section className="admin-error-state">
          <p className="admin-error" role="alert">
            {logs.errorMessage}
          </p>
          <Button loading={logs.loading} onClick={() => void logs.refresh()}>
            {copy.logs.retry}
          </Button>
        </section>
      ) : null}
      {!logs.errorMessage && !logs.loading && !logs.events.length ? (
        <p className="admin-empty">{copy.logs.empty}</p>
      ) : null}
      <section className="log-list" aria-label={copy.logs.auditEvents}>
        {logs.events.map((event) => (
          <article className="log-event" key={event.id}>
            <div className="log-title">
              <span className={`severity tone-${event.severity}`}>
                {copy.logs.severityLabels[event.severity] ?? event.severity}
              </span>
              <strong>{event.event_type}</strong>
              <time dateTime={event.timestamp}>
                {logs.formatDateTime(event.timestamp)}
              </time>
            </div>
            <dl>
              <div>
                <dt>{copy.logs.route}</dt>
                <dd>
                  {event.method || '-'} {event.route || '-'}
                </dd>
              </div>
              <div>
                <dt>{copy.logs.status}</dt>
                <dd>{event.status_code ?? '-'}</dd>
              </div>
              <div>
                <dt>{copy.logs.duration}</dt>
                <dd>
                  {event.duration_ms == null ? '-' : `${event.duration_ms}ms`}
                </dd>
              </div>
              <div>
                <dt>{copy.logs.requestId}</dt>
                <dd>{event.request_id || '-'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </main>
  )
}
export default AdminLogsPage
