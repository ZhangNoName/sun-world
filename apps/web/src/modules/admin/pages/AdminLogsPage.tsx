import { LabeledInput, SelectField } from '@/shared/ui/form-controls'
import { Button } from '@sun-world/ui/button'
import {
  useAdminLogs,
  type AdminLogSeverity,
} from '../composables/useAdminLogs'
import './admin.css'

const severityOptions = [
  { value: 'all', label: '全部级别' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' },
]

export function AdminLogsPage() {
  const logs = useAdminLogs()
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Security</p>
          <h1>审计日志</h1>
          <p>仅展示经过脱敏的稳定事件字段。</p>
        </div>
        <Button loading={logs.loading} onClick={() => void logs.refresh()}>
          刷新
        </Button>
      </header>
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault()
          void logs.refresh()
        }}
      >
        <SelectField
          label="级别"
          value={logs.severity || 'all'}
          options={severityOptions}
          onValueChange={(value) =>
            logs.setSeverity(value === 'all' ? '' : (value as AdminLogSeverity))
          }
        />
        <LabeledInput
          label="事件类型"
          value={logs.eventType}
          onValueChange={logs.setEventType}
          placeholder="例如 request_completed"
        />
        <LabeledInput
          label="数量"
          type="number"
          min={1}
          max={200}
          value={String(logs.limit)}
          onValueChange={(value) => logs.setLimit(Number(value))}
        />
        <Button type="submit" variant="secondary">
          应用筛选
        </Button>
      </form>
      {logs.retentionCopy ? (
        <p className="retention-summary">{logs.retentionCopy}</p>
      ) : null}
      {logs.errorMessage ? (
        <p className="admin-error" role="alert">
          {logs.errorMessage}
        </p>
      ) : null}
      {!logs.loading && !logs.events.length ? (
        <p className="admin-empty">暂无审计事件</p>
      ) : null}
      <section className="log-list" aria-label="审计事件">
        {logs.events.map((event) => (
          <article className="log-event" key={event.id}>
            <div className="log-title">
              <span className={`severity tone-${event.severity}`}>
                {event.severity}
              </span>
              <strong>{event.event_type}</strong>
              <time dateTime={event.timestamp}>
                {logs.formatDateTime(event.timestamp)}
              </time>
            </div>
            <dl>
              <div>
                <dt>路由</dt>
                <dd>
                  {event.method || '-'} {event.route || '-'}
                </dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{event.status_code ?? '-'}</dd>
              </div>
              <div>
                <dt>耗时</dt>
                <dd>
                  {event.duration_ms == null ? '-' : `${event.duration_ms}ms`}
                </dd>
              </div>
              <div>
                <dt>请求 ID</dt>
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
