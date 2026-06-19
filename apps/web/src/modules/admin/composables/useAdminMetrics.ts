import { computed, onMounted, ref } from 'vue'
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
  AdminRumEventSample,
  AdminRouteMetric,
  AdminStatusMetric,
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
  const snapshot = ref<AdminMetricsSnapshot | null>(null)
  const telemetrySnapshot = ref<AdminTelemetrySnapshot | null>(null)
  const alertsSnapshot = ref<AdminAlertsSnapshot | null>(null)
  const requestHistory = ref<AdminMetricsHistorySnapshot | null>(null)
  const rumHistory = ref<AdminMetricsHistorySnapshot | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')
  const lastLoadedAt = ref<Date | null>(null)

  const routes = computed<AdminRouteMetric[]>(() =>
    [...(snapshot.value?.routes ?? [])].sort((a, b) => {
      if (b.error_count !== a.error_count) return b.error_count - a.error_count
      return b.avg_duration_ms - a.avg_duration_ms
    })
  )

  const statuses = computed<AdminStatusMetric[]>(() =>
    [...(snapshot.value?.statuses ?? [])].sort((a, b) => b.status - a.status)
  )

  const webVitals = computed(() =>
    Object.entries(telemetrySnapshot.value?.web_vitals ?? {})
      .map(([metric, values]) => ({ metric, ...values }))
      .sort((a, b) => b.poor_count - a.poor_count || b.avg_value - a.avg_value)
  )

  const recentRumEvents = computed<AdminRumEventSample[]>(() =>
    telemetrySnapshot.value?.recent_events ?? []
  )

  const activeAlerts = computed<AdminMetricAlert[]>(() =>
    [...(alertsSnapshot.value?.alerts ?? [])].sort((a, b) => {
      const severityOrder = { critical: 2, warning: 1 }
      return severityOrder[b.severity] - severityOrder[a.severity]
    })
  )

  const metricCards = computed<AdminMetricCard[]>(() => {
    const current = snapshot.value
    const totalRequests = current?.total_requests ?? 0
    const errorRequests = current?.error_requests ?? 0
    const errorRate = totalRequests > 0 ? errorRequests / totalRequests : 0

    return [
      {
        key: 'total',
        label: '总请求',
        value: formatNumber(totalRequests),
        tone: 'default',
        caption: '当前进程累计请求数',
      },
      {
        key: 'errors',
        label: '错误请求',
        value: formatNumber(errorRequests),
        tone: errorRequests > 0 ? 'danger' : 'success',
        caption: `${formatPercent(errorRate)} 错误率`,
      },
      {
        key: 'avg',
        label: '平均耗时',
        value: `${formatNumber(current?.avg_duration_ms ?? 0)}ms`,
        tone: getLatencyTone(current?.avg_duration_ms ?? 0),
        caption: '所有请求平均响应耗时',
      },
      {
        key: 'p95',
        label: 'P95 耗时',
        value: `${formatNumber(current?.p95_duration_ms ?? 0)}ms`,
        tone: getLatencyTone(current?.p95_duration_ms ?? 0),
        caption: '当前窗口内的 p95 请求耗时',
      },
      {
        key: 'max',
        label: '峰值耗时',
        value: `${formatNumber(current?.max_duration_ms ?? 0)}ms`,
        tone: getLatencyTone(current?.max_duration_ms ?? 0),
        caption: '当前窗口内最高响应耗时',
      },
    ]
  })

  const telemetryCards = computed<AdminMetricCard[]>(() => {
    const current = telemetrySnapshot.value
    const totalEvents = current?.total_events ?? 0
    const rejectedEvents = current?.rejected_events ?? 0
    const rejectedRate = totalEvents > 0 ? rejectedEvents / totalEvents : 0

    const eventsByName = current?.events_by_name ?? {}
    const browserErrors =
      (eventsByName.global_error ?? 0) +
      (eventsByName.unhandled_rejection ?? 0) +
      (eventsByName.api_error ?? 0)

    return [
      {
        key: 'rum-total',
        label: 'RUM events',
        value: formatNumber(totalEvents),
        tone: 'default',
        caption: 'Frontend telemetry events in this API process',
      },
      {
        key: 'rum-rejected',
        label: 'Rejected',
        value: formatNumber(rejectedEvents),
        tone: rejectedEvents > 0 ? 'warning' : 'success',
        caption: `${formatPercent(rejectedRate)} rejected by contract`,
      },
      {
        key: 'rum-vitals',
        label: 'Web Vitals',
        value: formatNumber(webVitals.value.length),
        tone: 'default',
        caption: 'Distinct browser performance metrics',
      },
      {
        key: 'rum-errors',
        label: 'Browser errors',
        value: formatNumber(browserErrors),
        tone: browserErrors > 0 ? 'danger' : 'success',
        caption: 'Global, promise, and API error events',
      },
    ]
  })

  const alertCards = computed<AdminMetricCard[]>(() => {
    const current = alertsSnapshot.value
    const criticalCount = current?.critical_count ?? 0
    const warningCount = current?.warning_count ?? 0
    const alertCount = current?.alert_count ?? 0

    return [
      {
        key: 'alerts-total',
        label: 'Active alerts',
        value: formatNumber(alertCount),
        tone: alertCount > 0 ? 'danger' : 'success',
        caption: `${formatNumber(criticalCount)} critical / ${formatNumber(warningCount)} warning`,
      },
    ]
  })

  const historyCards = computed<AdminMetricCard[]>(() => [
    {
      key: 'history-request',
      label: 'Request history',
      value: formatNumber(requestHistory.value?.snapshot_count ?? 0),
      tone: (requestHistory.value?.snapshot_count ?? 0) > 0 ? 'success' : 'default',
      caption: `Last ${formatNumber(requestHistory.value?.limit ?? 20)} request snapshots`,
    },
    {
      key: 'history-rum',
      label: 'RUM history',
      value: formatNumber(rumHistory.value?.snapshot_count ?? 0),
      tone: (rumHistory.value?.snapshot_count ?? 0) > 0 ? 'success' : 'default',
      caption: `Last ${formatNumber(rumHistory.value?.limit ?? 20)} RUM snapshots`,
    },
  ])

  async function refresh() {
    loading.value = true
    errorMessage.value = ''

    try {
      const [requestMetrics, rumMetrics, alertMetrics] = await Promise.all([
        fetchAdminMetrics(),
        fetchAdminTelemetry(),
        fetchAdminAlerts(),
      ])
      snapshot.value = requestMetrics
      telemetrySnapshot.value = rumMetrics
      alertsSnapshot.value = alertMetrics

      const [requestHistorySnapshot, rumHistorySnapshot] = await Promise.all([
        fetchAdminMetricsHistory('request'),
        fetchAdminMetricsHistory('rum'),
      ])
      requestHistory.value = requestHistorySnapshot
      rumHistory.value = rumHistorySnapshot
      lastLoadedAt.value = new Date()
    } catch (error) {
      errorMessage.value = getAdminErrorMessage(error)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    refresh()
  })

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

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('zh-CN', {
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

function getLatencyTone(value: number): AdminMetricCard['tone'] {
  if (value >= 1200) return 'danger'
  if (value >= 500) return 'warning'
  return 'success'
}
