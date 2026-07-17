import { renderHook, waitFor } from '@testing-library/react'
import { fetchAdminLogs } from '../api'
import { useAdminLogs } from './useAdminLogs'

vi.mock('../api')

describe('useAdminLogs', () => {
  it('applies bounded limit, severity and trimmed event type filters', async () => {
    vi.mocked(fetchAdminLogs).mockResolvedValue({
      event_count: 0,
      events: [],
      max_file_bytes: 1024,
      retained_file_count: 2,
    })
    const { result } = renderHook(() =>
      useAdminLogs({ limit: 999, severity: 'error', eventType: ' request ' })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchAdminLogs).toHaveBeenCalledWith({
      limit: 200,
      severity: 'error',
      eventType: 'request',
    })
    expect(result.current.retentionCopy).toContain('2')
  })
})
