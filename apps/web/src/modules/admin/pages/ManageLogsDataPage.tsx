import { useMemo, useRef } from 'react'

import { SunIcon } from '@sun-world/icons/react'
import { SwButton as Button } from '@sun-world/ui/sw-button'

import { fetchAdminLogs } from '../api'
import type { AdminLogEvent } from '../types'
import { useManageCopy } from '../manageCopy'
import {
  ManageDataPage,
  type ManageDataPageRef,
} from '../components/ManageDataPage'
import type { ManageColumn } from '../components/ManageTypes'

export default function ManageLogsDataPage() {
  const copy = useManageCopy()
  const pageRef = useRef<ManageDataPageRef<AdminLogEvent>>(null)
  const columns = useMemo<Array<ManageColumn<AdminLogEvent>>>(
    () => [
      { key: 'timestamp', title: copy.logs.time, type: 'date' },
      {
        key: 'severity',
        title: copy.logs.severity,
        type: 'dict',
        dictCode: 'audit_severity',
        search: { label: copy.logs.severity, type: 'dict' },
      },
      {
        key: 'event_type',
        title: copy.logs.eventType,
        search: {
          label: copy.logs.eventType,
          placeholder: copy.logs.eventPlaceholder,
        },
      },
      {
        key: 'method',
        title: copy.logs.method,
        formatter: (value) =>
          value == null || value === '' ? '—' : String(value),
      },
      {
        key: 'route',
        title: copy.logs.route,
        formatter: (value) =>
          value == null || value === '' ? '—' : String(value),
      },
      { key: 'status_code', title: copy.logs.status, type: 'number' },
      {
        key: 'duration_ms',
        title: copy.logs.duration,
        formatter: (value) => (value == null ? '—' : `${value} ms`),
      },
      {
        key: 'request_id',
        title: copy.logs.requestId,
        render: ({ row }) => (
          <span title={row.request_id ?? undefined}>
            {row.request_id ?? '—'}
          </span>
        ),
      },
    ],
    [copy]
  )

  return (
    <ManageDataPage
      ref={pageRef}
      title={copy.logs.title}
      description={copy.logs.description}
      columns={columns}
      rowKey={(row) => row.id}
      fetchPage={async ({ page, pageSize, search }) => {
        const severity = String(search.severity ?? '').trim()
        const result = await fetchAdminLogs({
          limit: 200,
          severity:
            severity && severity !== 'all'
              ? (severity as
                  | 'debug'
                  | 'info'
                  | 'warning'
                  | 'error'
                  | 'critical')
              : undefined,
          eventType: String(search.event_type ?? '').trim() || undefined,
        })
        const rows = result.events ?? []
        const start = (page - 1) * pageSize
        return { rows: rows.slice(start, start + pageSize), total: rows.length }
      }}
      toolbar={{
        right: ({ refresh, isLoading }) => (
          <Button
            variant="outline"
            loading={isLoading}
            onClick={() => void refresh()}
          >
            <SunIcon name="refresh-cw" />
            {copy.logs.refresh}
          </Button>
        ),
      }}
    />
  )
}
