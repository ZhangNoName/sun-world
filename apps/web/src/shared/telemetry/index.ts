/**
 * Vendor-neutral frontend telemetry client.
 *
 * The app instruments Web Vitals, route timing, global errors, and API
 * failures through this module. Production delivery is adapter-based:
 * provide a custom reporter or configure a telemetry endpoint later without
 * changing feature modules.
 */

import type { Metric } from 'web-vitals'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { IS_DEVELOPMENT, TELEMETRY_ENDPOINT } from '@/shared/config'

export type TelemetryEventName =
  | 'web_vital'
  | 'route_timing'
  | 'global_error'
  | 'unhandled_rejection'
  | 'api_timing'
  | 'api_error'
  | 'user_action'

export type TelemetrySeverity = 'debug' | 'info' | 'warning' | 'error'

export interface TelemetryEvent {
  name: TelemetryEventName
  severity: TelemetrySeverity
  timestamp: string
  page: string
  sessionId: string
  properties?: Record<string, unknown>
}

export type TelemetryReporter = (
  event: TelemetryEvent
) => void | Promise<void>

export interface ApiTelemetryContext {
  method: string
  url: string
  duration: number
  status?: number
  code?: number | string
}

type VitalReporter = (metric: Metric) => void

const SESSION_KEY = 'sun_world_telemetry_session_id'

let telemetryReporter: TelemetryReporter | null = null
let vitalReporter: VitalReporter | null = null

export function setTelemetryReporter(reporter: TelemetryReporter) {
  telemetryReporter = reporter
}

/**
 * Backward-compatible metric reporter hook for callers that only care about
 * raw Web Vitals metrics.
 */
export function setVitalReporter(reporter: VitalReporter) {
  vitalReporter = reporter
}

export function trackEvent(
  name: TelemetryEventName,
  properties: Record<string, unknown> = {},
  severity: TelemetrySeverity = 'info'
) {
  const event = createTelemetryEvent(name, properties, severity)
  void reportTelemetryEvent(event)
}

export function trackApiTiming(context: ApiTelemetryContext) {
  trackEvent(
    'api_timing',
    {
      method: context.method,
      url: normaliseUrl(context.url),
      duration: Math.round(context.duration),
      status: context.status,
      code: context.code,
    },
    'debug'
  )
}

export function trackApiError(error: unknown, context: ApiTelemetryContext) {
  const payload =
    error && typeof error === 'object'
      ? (error as { name?: string; message?: string; code?: number | string })
      : null

  trackEvent(
    'api_error',
    {
      method: context.method,
      url: normaliseUrl(context.url),
      duration: Math.round(context.duration),
      status: context.status,
      code: context.code ?? payload?.code,
      errorName: payload?.name,
      message: payload?.message,
    },
    'error'
  )
}

export async function initWebVitals() {
  try {
    const { onLCP, onCLS, onFCP, onTTFB, onINP } = await import(
      'web-vitals'
    )
    onLCP(reportVital)
    onCLS(reportVital)
    onFCP(reportVital)
    onTTFB(reportVital)
    onINP(reportVital)
  } catch {
    // Telemetry must never block app startup.
  }
}

export function installRouteTiming(router: Router) {
  let routeStartedAt = 0
  let fromRoute: RouteLocationNormalized | null = null

  router.beforeEach((to, from) => {
    routeStartedAt = now()
    fromRoute = from
    return true
  })

  router.afterEach((to) => {
    if (!routeStartedAt) return

    trackEvent(
      'route_timing',
      {
        to: to.fullPath,
        from: fromRoute?.fullPath,
        duration: Math.round(now() - routeStartedAt),
      },
      'debug'
    )

    routeStartedAt = 0
    fromRoute = null
  })
}

export function installGlobalErrorCapture() {
  window.addEventListener('error', (event) => {
    trackEvent(
      'global_error',
      {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        errorName: event.error?.name,
      },
      'error'
    )
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error ? reason.message : safeStringify(reason)

    trackEvent(
      'unhandled_rejection',
      {
        message,
        errorName: reason instanceof Error ? reason.name : undefined,
      },
      'error'
    )
  })
}

function reportVital(metric: Metric) {
  vitalReporter?.(metric)

  trackEvent(
    'web_vital',
    {
      id: metric.id,
      metric: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
    },
    metric.rating === 'poor' ? 'warning' : 'info'
  )
}

function createTelemetryEvent(
  name: TelemetryEventName,
  properties: Record<string, unknown>,
  severity: TelemetrySeverity
): TelemetryEvent {
  return {
    name,
    severity,
    timestamp: new Date().toISOString(),
    page: getPage(),
    sessionId: getSessionId(),
    properties,
  }
}

async function reportTelemetryEvent(event: TelemetryEvent) {
  const reporter = telemetryReporter ?? defaultReporter

  try {
    await reporter(event)
  } catch {
    // Reporting failures must not cascade into product behavior.
  }
}

const defaultReporter: TelemetryReporter = (event) => {
  if (IS_DEVELOPMENT) {
    console.info(`[telemetry] ${event.name}`, event)
    return
  }

  if (!TELEMETRY_ENDPOINT || typeof window === 'undefined') return

  const body = JSON.stringify(event)

  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      TELEMETRY_ENDPOINT,
      new Blob([body], { type: 'application/json' })
    )
    return
  }

  void fetch(TELEMETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  })
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'

  const existing = window.sessionStorage.getItem(SESSION_KEY)
  if (existing) return existing

  const id =
    window.crypto?.randomUUID?.() ??
    `session_${Date.now()}_${Math.random().toString(16).slice(2)}`
  window.sessionStorage.setItem(SESSION_KEY, id)
  return id
}

function getPage(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.pathname}${window.location.search}`
}

function now(): number {
  if (typeof performance !== 'undefined') return performance.now()
  return Date.now()
}

function normaliseUrl(url: string): string {
  return url.split('?')[0] || url
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
