import { apiGet } from '@/shared/api'
import type { AdminMetricsSnapshot } from './types'

export function fetchAdminMetrics(): Promise<AdminMetricsSnapshot> {
  return apiGet('/admin/metrics')
}
