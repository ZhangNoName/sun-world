import { act, renderHook, waitFor } from '@testing-library/react'
import * as api from '../api'
import { useAdminMetrics } from './useAdminMetrics'

vi.mock('../api')

const metrics = {
  total_requests: 10,
  error_requests: 1,
  avg_duration_ms: 120,
  p50_duration_ms: 90,
  p95_duration_ms: 300,
  p99_duration_ms: 500,
  max_duration_ms: 800,
  generated_at: '2026-07-17T00:00:00Z',
  routes: [],
  statuses: [],
}

describe('useAdminMetrics', () => {
  it('loads all snapshots once per refresh and exposes alert/history cards', async () => {
    vi.mocked(api.fetchAdminMetrics).mockResolvedValue(metrics)
    vi.mocked(api.fetchAdminTelemetry).mockResolvedValue({
      accepted_events: 2,
      rejected_events: 0,
      total_events: 2,
      started_at: '2026-07-17T00:00:00Z',
      generated_at: '2026-07-17T00:00:00Z',
      web_vitals: {},
    })
    vi.mocked(api.fetchAdminAlerts).mockResolvedValue({
      alert_count: 1,
      critical_count: 1,
      warning_count: 0,
      generated_at: '2026-07-17T00:00:00Z',
      alerts: [
        {
          key: 'latency',
          label: 'Latency',
          severity: 'critical',
          actual: 800,
          threshold: 500,
          unit: 'ms',
        },
      ],
    })
    vi.mocked(api.fetchAdminMetricsHistory).mockImplementation(
      async (kind) => ({
        kind,
        limit: 20,
        snapshot_count: 1,
        snapshots: [{}],
      })
    )

    const { result } = renderHook(() => useAdminMetrics())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.metricCards[0]?.value).toBe('10')
    expect(result.current.activeAlerts[0]?.severity).toBe('critical')
    expect(api.fetchAdminMetricsHistory).toHaveBeenCalledTimes(2)

    await act(() => result.current.refresh())
    expect(api.fetchAdminMetricsHistory).toHaveBeenCalledTimes(4)
  })
})
