import type { ApiSuccessData, components } from '@sun-world/contracts'

export type AdminMetricsSnapshot =
  ApiSuccessData<'/admin/metrics', 'get'> extends never
    ? components['schemas']['RequestMetricsSnapshot']
    : NonNullable<ApiSuccessData<'/admin/metrics', 'get'>>

export type AdminTelemetrySnapshot =
  ApiSuccessData<'/admin/telemetry', 'get'> extends never
    ? components['schemas']['RumMetricsSnapshot']
    : NonNullable<ApiSuccessData<'/admin/telemetry', 'get'>>

export type AdminAlertsSnapshot =
  ApiSuccessData<'/admin/alerts', 'get'> extends never
    ? components['schemas']['AdminAlertsSnapshot']
    : NonNullable<ApiSuccessData<'/admin/alerts', 'get'>>

export type AdminMetricsHistorySnapshot =
  ApiSuccessData<'/admin/metrics/history', 'get'> extends never
    ? components['schemas']['MetricsHistorySnapshot']
    : NonNullable<ApiSuccessData<'/admin/metrics/history', 'get'>>

export type AdminRouteMetric = components['schemas']['RouteMetric']
export type AdminStatusMetric = components['schemas']['StatusMetric']
export type AdminRumEventSample = components['schemas']['RumEventSample']
export type AdminMetricAlert = components['schemas']['MetricAlert']
