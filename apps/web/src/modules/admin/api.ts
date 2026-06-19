import { API_ROUTES } from '@sun-world/contracts'
import { apiGet } from '@/shared/api'
import type {
  AdminAlertsSnapshot,
  AdminMetricsHistorySnapshot,
  AdminMetricsSnapshot,
  AdminTelemetrySnapshot,
} from './types'

export function fetchAdminMetrics(): Promise<AdminMetricsSnapshot> {
  return apiGet(API_ROUTES.admin.metrics)
}

export function fetchAdminTelemetry(): Promise<AdminTelemetrySnapshot> {
  return apiGet(API_ROUTES.admin.telemetry)
}

export function fetchAdminAlerts(): Promise<AdminAlertsSnapshot> {
  return apiGet(API_ROUTES.admin.alerts)
}

export function fetchAdminMetricsHistory(
  kind: 'request' | 'rum',
  limit = 20
): Promise<AdminMetricsHistorySnapshot> {
  return apiGet(API_ROUTES.admin.metricsHistory, {
    query: { kind, limit },
  })
}
