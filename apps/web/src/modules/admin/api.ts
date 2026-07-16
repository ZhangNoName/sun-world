import { API_ROUTES } from '@sun-world/contracts'
import { apiGet } from '@/shared/api'
import type {
  AdminAlertsSnapshot,
  AdminLogsSnapshot,
  AdminMetricsHistorySnapshot,
  AdminMetricsSnapshot,
  AdminTelemetrySnapshot,
} from './types'

export interface AdminLogsQuery {
  limit?: number
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical'
  eventType?: string
}

export function fetchAdminMetrics(): Promise<AdminMetricsSnapshot> {
  return apiGet(API_ROUTES.admin.metrics)
}

export function fetchAdminTelemetry(): Promise<AdminTelemetrySnapshot> {
  return apiGet(API_ROUTES.admin.telemetry)
}

export function fetchAdminAlerts(): Promise<AdminAlertsSnapshot> {
  return apiGet(API_ROUTES.admin.alerts)
}

export function fetchAdminLogs({
  limit = 50,
  severity,
  eventType,
}: AdminLogsQuery = {}): Promise<AdminLogsSnapshot> {
  return apiGet(API_ROUTES.admin.logs, {
    query: {
      limit,
      severity,
      event_type: eventType || undefined,
    },
  })
}

export function fetchAdminMetricsHistory(
  kind: 'request' | 'rum',
  limit = 20
): Promise<AdminMetricsHistorySnapshot> {
  return apiGet(API_ROUTES.admin.metricsHistory, {
    query: { kind, limit },
  })
}
