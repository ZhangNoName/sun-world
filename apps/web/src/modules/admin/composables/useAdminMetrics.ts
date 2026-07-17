import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchAdminAlerts,
  fetchAdminMetrics,
  fetchAdminMetricsHistory,
  fetchAdminTelemetry,
} from '../api'
import { getAdminErrorMessage } from '../errors'
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
      card('total', '总请求', total, '当前进程累计请求数'),
      card(
        'errors',
        '错误请求',
        errors,
        `${formatPercent(total ? errors / total : 0)} 错误率`,
        errors ? 'danger' : 'success'
      ),
      latencyCard('avg', '平均耗时', snapshot?.avg_duration_ms ?? 0),
      latencyCard('p95', 'P95 耗时', snapshot?.p95_duration_ms ?? 0),
      latencyCard('max', '峰值耗时', snapshot?.max_duration_ms ?? 0),
    ]
  }, [snapshot])
  const telemetryCards = useMemo<AdminMetricCard[]>(() => {
    const total = telemetrySnapshot?.total_events ?? 0
    const rejected = telemetrySnapshot?.rejected_events ?? 0
    const names = telemetrySnapshot?.events_by_name ?? {}
    const errors =
      (names.global_error ?? 0) +
      (names.unhandled_rejection ?? 0) +
      (names.api_error ?? 0)
    return [
      card('rum-total', 'RUM 事件', total, '浏览器遥测事件'),
      card(
        'rum-rejected',
        '拒绝事件',
        rejected,
        `${formatPercent(total ? rejected / total : 0)} 被契约拒绝`,
        rejected ? 'warning' : 'success'
      ),
      card('rum-vitals', 'Web Vitals', webVitals.length, '浏览器性能指标种类'),
      card(
        'rum-errors',
        '浏览器错误',
        errors,
        '全局、Promise 与 API 错误',
        errors ? 'danger' : 'success'
      ),
    ]
  }, [telemetrySnapshot, webVitals.length])
  const alertCards = [
    card(
      'alerts-total',
      '活动告警',
      alertsSnapshot?.alert_count ?? 0,
      `${alertsSnapshot?.critical_count ?? 0} 严重 / ${alertsSnapshot?.warning_count ?? 0} 警告`,
      alertsSnapshot?.alert_count ? 'danger' : 'success'
    ),
  ]
  const historyCards = [
    card(
      'history-request',
      '请求历史',
      requestHistory?.snapshot_count ?? 0,
      `最近 ${requestHistory?.limit ?? 20} 个快照`
    ),
    card(
      'history-rum',
      'RUM 历史',
      rumHistory?.snapshot_count ?? 0,
      `最近 ${rumHistory?.limit ?? 20} 个快照`
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
    formatDateTime,
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
  value: number
): AdminMetricCard {
  return {
    ...card(key, label, value, '当前窗口响应耗时', latencyTone(value)),
    value: `${formatNumber(value)}ms`,
  }
}
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}
export function formatDateTime(
  value: string | Date | null | undefined
): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
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
function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value)
}
function latencyTone(value: number): AdminMetricCard['tone'] {
  return value >= 1200 ? 'danger' : value >= 500 ? 'warning' : 'success'
}
