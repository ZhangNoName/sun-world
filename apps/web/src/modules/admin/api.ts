import { request } from '@/service/http'
import type { AdminMetricsSnapshot } from './types'

export function fetchAdminMetrics(): Promise<AdminMetricsSnapshot> {
  return request.get<AdminMetricsSnapshot>('/admin/metrics')
}
