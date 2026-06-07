import { computed, onMounted, ref } from 'vue'
import { fetchAdminMetrics } from '../api'
import { getAdminErrorMessage } from '../errors'
import type {
  AdminMetricsSnapshot,
  AdminRouteMetric,
  AdminStatusMetric,
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
        key: 'max',
        label: '峰值耗时',
        value: `${formatNumber(current?.max_duration_ms ?? 0)}ms`,
        tone: getLatencyTone(current?.max_duration_ms ?? 0),
        caption: '当前窗口内最高响应耗时',
      },
    ]
  })

  async function refresh() {
    loading.value = true
    errorMessage.value = ''

    try {
      snapshot.value = await fetchAdminMetrics()
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
    routes,
    statuses,
    metricCards,
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
