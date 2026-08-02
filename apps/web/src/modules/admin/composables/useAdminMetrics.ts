import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAdminAlerts,
  fetchAdminMetrics,
  fetchAdminMetricsHistory,
  fetchAdminTelemetry,
} from '../api'
import { getAdminErrorMessage } from '../errors'
import { useManageCopy, useManageLocale } from '../manageCopy'
import type {
  AdminAlertsSnapshot,
  AdminMetricsHistorySnapshot,
  AdminMetricAlert,
  AdminMetricsSnapshot,
  AdminTelemetrySnapshot,
} from '../types'

export interface AdminMetricCard {
  key: string
  label: string
  value: string
  tone: 'default' | 'success' | 'warning' | 'danger'
  caption: string
}

export function useAdminMetrics() {
  const copy = useManageCopy()
  const locale = useManageLocale()
  const [snapshot, setSnapshot] = useState<AdminMetricsSnapshot | null>(null)
  const [telemetrySnapshot, setTelemetrySnapshot] =
    useState<AdminTelemetrySnapshot | null>(null)
  const [alertsSnapshot, setAlertsSnapshot] =
    useState<AdminAlertsSnapshot | null>(null)
  const [requestHistory, setRequestHistory] =
    useState<AdminMetricsHistorySnapshot | null>(null)
  const [rumHistory, setRumHistory] =
    useState<AdminMetricsHistorySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const refreshId = useRef(0)

  const refresh = useCallback(async () => {
    const currentId = ++refreshId.current
    setLoading(true)
    setErrorMessage('')
    try {
      const [metrics, telemetry, alerts, requests, rum] = await Promise.all([
        fetchAdminMetrics(),
        fetchAdminTelemetry(),
        fetchAdminAlerts(),
        fetchAdminMetricsHistory('request'),
        fetchAdminMetricsHistory('rum'),
      ])
      if (currentId !== refreshId.current) return
      setSnapshot(metrics)
      setTelemetrySnapshot(telemetry)
      setAlertsSnapshot(alerts)
      setRequestHistory(requests)
      setRumHistory(rum)
      setLastLoadedAt(new Date())
    } catch (error) {
      if (currentId === refreshId.current)
        setErrorMessage(getAdminErrorMessage(error))
    } finally {
      if (currentId === refreshId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      refreshId.current += 1
    }
  }, [refresh])

  const routes = useMemo(
    () =>
      [...(snapshot?.routes ?? [])].sort(
        (a, b) =>
          b.error_count - a.error_count || b.avg_duration_ms - a.avg_duration_ms
      ),
    [snapshot]
  )
  const statuses = useMemo(
    () => [...(snapshot?.statuses ?? [])].sort((a, b) => b.status - a.status),
    [snapshot]
  )
  const webVitals = useMemo(
    () =>
      Object.entries(telemetrySnapshot?.web_vitals ?? {})
        .map(([metric, values]) => ({ metric, ...values }))
        .sort(
          (a, b) => b.poor_count - a.poor_count || b.avg_value - a.avg_value
        ),
    [telemetrySnapshot]
  )
  const recentRumEvents = telemetrySnapshot?.recent_events ?? []
  const activeAlerts = useMemo<AdminMetricAlert[]>(
    () =>
      [...(alertsSnapshot?.alerts ?? [])].sort((a, b) => {
        const order = { critical: 2, warning: 1 }
        return order[b.severity] - order[a.severity]
      }),
    [alertsSnapshot]
  )
  const metricCards = useMemo<AdminMetricCard[]>(() => {
    const total = snapshot?.total_requests ?? 0
    const errors = snapshot?.error_requests ?? 0
    return [
      card(
        'total',
        copy.metrics.totalRequests,
        total,
        copy.metrics.currentProcessRequests
      ),
      card(
        'errors',
        copy.metrics.errorRequests,
        errors,
        `${formatPercent(total ? errors / total : 0, locale)} ${copy.metrics.errorRate}`,
        errors ? 'danger' : 'success'
      ),
      latencyCard(
        'avg',
        copy.metrics.avgDuration,
        snapshot?.avg_duration_ms ?? 0,
        copy.metrics.latencyCaption
      ),
      latencyCard(
        'p95',
        copy.metrics.p95Duration,
        snapshot?.p95_duration_ms ?? 0,
        copy.metrics.latencyCaption
      ),
      latencyCard(
        'max',
        copy.metrics.peakDuration,
        snapshot?.max_duration_ms ?? 0,
        copy.metrics.latencyCaption
      ),
    ]
  }, [copy, locale, snapshot])
  const telemetryCards = useMemo<AdminMetricCard[]>(() => {
    const total = telemetrySnapshot?.total_events ?? 0
    const rejected = telemetrySnapshot?.rejected_events ?? 0
    const names = telemetrySnapshot?.events_by_name ?? {}
    const errors =
      (names.global_error ?? 0) +
      (names.unhandled_rejection ?? 0) +
      (names.api_error ?? 0)
    return [
      card(
        'rum-total',
        copy.metrics.rumEvents,
        total,
        copy.metrics.browserTelemetry
      ),
      card(
        'rum-rejected',
        copy.metrics.rejectedEvents,
        rejected,
        `${formatPercent(total ? rejected / total : 0, locale)} ${copy.metrics.rejectedByContract}`,
        rejected ? 'warning' : 'success'
      ),
      card(
        'rum-vitals',
        copy.metrics.webVitals,
        webVitals.length,
        copy.metrics.webVitalsKinds
      ),
      card(
        'rum-errors',
        copy.metrics.browserErrors,
        errors,
        copy.metrics.browserErrorsCaption,
        errors ? 'danger' : 'success'
      ),
    ]
  }, [copy, locale, telemetrySnapshot, webVitals.length])
  const alertCards = [
    card(
      'alerts-total',
      copy.metrics.alerts,
      alertsSnapshot?.alert_count ?? 0,
      copy.metrics.severitySummary(
        alertsSnapshot?.critical_count ?? 0,
        alertsSnapshot?.warning_count ?? 0
      ),
      alertsSnapshot?.alert_count ? 'danger' : 'success'
    ),
  ]
  const historyCards = [
    card(
      'history-request',
      copy.metrics.requestHistory,
      requestHistory?.snapshot_count ?? 0,
      copy.metrics.snapshots(requestHistory?.limit ?? 20)
    ),
    card(
      'history-rum',
      copy.metrics.rumHistory,
      rumHistory?.snapshot_count ?? 0,
      copy.metrics.snapshots(rumHistory?.limit ?? 20)
    ),
  ]

  return {
    snapshot,
    telemetrySnapshot,
    alertsSnapshot,
    requestHistory,
    rumHistory,
    routes,
    statuses,
    webVitals,
    recentRumEvents,
    activeAlerts,
    metricCards,
    telemetryCards,
    alertCards,
    historyCards,
    loading,
    errorMessage,
    lastLoadedAt,
    refresh,
    formatDateTime: (value: string | Date | null | undefined) =>
      formatDateTime(value, locale),
    formatNumber,
  }
}

function card(
  key: string,
  label: string,
  value: number,
  caption: string,
  tone: AdminMetricCard['tone'] = 'default'
): AdminMetricCard {
  return { key, label, value: formatNumber(value), tone, caption }
}
function latencyCard(
  key: string,
  label: string,
  value: number,
  caption: string
): AdminMetricCard {
  return {
    ...card(key, label, value, caption, latencyTone(value)),
    value: `${formatNumber(value)}ms`,
  }
}
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: 'zh' | 'en' = 'zh'
): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date)
}
function formatPercent(value: number, locale: 'zh' | 'en'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value)
}
function latencyTone(value: number): AdminMetricCard['tone'] {
  return value >= 1200 ? 'danger' : value >= 500 ? 'warning' : 'success'
}
