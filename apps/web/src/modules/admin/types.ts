import type { components, operations } from '@sun-world/contracts'

type AdminMetricsOperation =
  operations['get_admin_metrics_admin_metrics_get']['responses'][200]['content']['application/json']

type ApiEnvelope<T> = {
  code: number | string
  data: T | null
  msg: string
}

export type AdminMetricsSnapshot =
  AdminMetricsOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['RequestMetricsSnapshot']

export type AdminRouteMetric = components['schemas']['RouteMetric']
export type AdminStatusMetric = components['schemas']['StatusMetric']
