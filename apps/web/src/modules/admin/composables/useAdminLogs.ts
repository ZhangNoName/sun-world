import { useCallback, useEffect, useState } from 'react'
import { fetchAdminLogs } from '../api'
import { getAdminErrorMessage } from '../errors'
import type { AdminLogEvent, AdminLogsSnapshot } from '../types'

export type AdminLogSeverity = NonNullable<AdminLogEvent['severity']>
export interface AdminLogsFilters {
  limit?: number
  severity?: AdminLogSeverity | ''
  eventType?: string
}

export function useAdminLogs(initial: AdminLogsFilters = {}) {
  const [snapshot, setSnapshot] = useState<AdminLogsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [limit, setLimit] = useState(clampLimit(initial.limit ?? 50))
  const [severity, setSeverity] = useState<AdminLogSeverity | ''>(
    initial.severity ?? ''
  )
  const [eventType, setEventType] = useState(initial.eventType ?? '')
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const next = await fetchAdminLogs({
        limit: clampLimit(limit),
        severity: severity || undefined,
        eventType: eventType.trim(),
      })
      setSnapshot(next)
      setLastLoadedAt(new Date())
    } catch (error) {
      setErrorMessage(getAdminErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [eventType, limit, severity])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    snapshot,
    events: snapshot?.events ?? [],
    loading,
    errorMessage,
    limit,
    setLimit: (value: number) => setLimit(clampLimit(value)),
    severity,
    setSeverity,
    eventType,
    setEventType,
    lastLoadedAt,
    refresh,
    retentionCopy: snapshot
      ? `保留 ${snapshot.retained_file_count} 个日志文件，单文件上限 ${formatBytes(snapshot.max_file_bytes)}`
      : '',
    formatDateTime,
  }
}

function clampLimit(value: number) {
  return Math.min(200, Math.max(1, Math.trunc(value) || 50))
}
function formatBytes(value: number) {
  return value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(value / 1024)} KB`
}
function formatDateTime(value: string | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date)
}
