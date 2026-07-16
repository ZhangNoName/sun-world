import { computed, onMounted, ref } from 'vue'
import { fetchAdminLogs } from '../api'
import { getAdminErrorMessage } from '../errors'
import type { AdminLogEvent, AdminLogsSnapshot } from '../types'

export type AdminLogSeverity = NonNullable<AdminLogEvent['severity']>

export function useAdminLogs() {
  const snapshot = ref<AdminLogsSnapshot | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')
  const severity = ref<AdminLogSeverity | ''>('')
  const eventType = ref('')
  const lastLoadedAt = ref<Date | null>(null)

  const events = computed<AdminLogEvent[]>(() => snapshot.value?.events ?? [])

  async function refresh() {
    loading.value = true
    errorMessage.value = ''
    try {
      snapshot.value = await fetchAdminLogs({
        severity: severity.value || undefined,
        eventType: eventType.value.trim(),
      })
      lastLoadedAt.value = new Date()
    } catch (error) {
      errorMessage.value = getAdminErrorMessage(error)
    } finally {
      loading.value = false
    }
  }

  onMounted(refresh)

  return {
    snapshot,
    events,
    loading,
    errorMessage,
    severity,
    eventType,
    lastLoadedAt,
    refresh,
    formatDateTime,
  }
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}
