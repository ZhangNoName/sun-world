/**
 * Frontend telemetry adapter.
 *
 * Phase 1:
 * - Captures Web Vitals (LCP, FID/INP, CLS, FCP, TTFB) via the `web-vitals` library.
 * - Captures route navigation timing and global errors.
 * - In development: logs metrics to the console.
 * - In production: no-op (console-safe). Replace with a real analytics
 *   adapter when a vendor or self-hosted solution is chosen.
 *
 * Phase 2+:
 * - Forward metrics to an analytics endpoint.
 * - Add custom user-action events.
 */

import type { Metric } from 'web-vitals'
import type { Router } from 'vue-router'
import { IS_DEVELOPMENT } from '@/shared/config'

// ---- Web Vitals ----

type VitalReporter = (metric: Metric) => void

let vitalReporter: VitalReporter | null = null

/**
 * Set a custom reporter for Web Vitals metrics.
 * Call once at app bootstrap to override the default dev-only console reporter.
 */
export function setVitalReporter(reporter: VitalReporter) {
  vitalReporter = reporter
}

function reportVital(metric: Metric) {
  if (vitalReporter) {
    vitalReporter(metric)
    return
  }

  if (IS_DEVELOPMENT) {
    console.log(
      `[telemetry] ${metric.name} = ${metric.value.toFixed(2)} (rating: ${metric.rating})`
    )
  }
}

/**
 * Initialise Web Vitals collection.
 *
 * The `web-vitals` library is imported dynamically so that it never
 * blocks the initial bundle parse - only users who trigger the import
 * pay the cost.
 */
export async function initWebVitals() {
  try {
    const { onLCP, onFID, onCLS, onFCP, onTTFB, onINP } = await import(
      'web-vitals'
    )
    onLCP(reportVital)
    onFID(reportVital)
    onCLS(reportVital)
    onFCP(reportVital)
    onTTFB(reportVital)
    // INP replaces FID in March 2024+; still experimental in some browsers
    onINP(reportVital)
  } catch {
    // web-vitals is unavailable - silently skip (non-critical feature)
  }
}

// ---- Route Navigation Timing ----

/**
 * Install a Vue Router guard that records navigation timing.
 *
 * Call once after router creation:
 *   installRouteTiming(router)
 *
 * In dev mode, logs navigation duration to the console.
 */
export function installRouteTiming(router: Router) {
  let routeStartedAt = 0

  router.beforeEach(() => {
    routeStartedAt = performance.now()
    return true
  })

  router.afterEach((to) => {
    if (!routeStartedAt) return

    const duration = performance.now() - routeStartedAt
    if (IS_DEVELOPMENT) {
      console.log(
        `[telemetry] navigation to ${to.fullPath}: ${duration.toFixed(0)} ms`
      )
    }
    routeStartedAt = 0
  })
}

// ---- Global Error Capture ----

/**
 * Install global error listeners.
 *
 * Captures unhandled errors and Promise rejections. In dev, logs to
 * console. In production this will be the hook point for error-reporting
 * services.
 */
export function installGlobalErrorCapture() {
  window.addEventListener('error', (event) => {
    if (IS_DEVELOPMENT) {
      console.error('[telemetry] global error:', event.message, event.filename)
    }
    // Phase 2: forward to error-reporting service
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (IS_DEVELOPMENT) {
      console.error('[telemetry] unhandled rejection:', event.reason)
    }
    // Phase 2: forward to error-reporting service
  })
}
