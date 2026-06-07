import type { ApiSuccessData, components } from '@sun-world/contracts'

export type AdminMetricsSnapshot =
  ApiSuccessData<'/admin/metrics', 'get'> extends never
    ? components['schemas']['RequestMetricsSnapshot']
    : NonNullable<ApiSuccessData<'/admin/metrics', 'get'>>

export type AdminRouteMetric = components['schemas']['RouteMetric']
export type AdminStatusMetric = components['schemas']['StatusMetric']
