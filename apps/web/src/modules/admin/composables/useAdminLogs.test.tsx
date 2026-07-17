import { act, renderHook, waitFor } from '@testing-library/react'
import { fetchAdminLogs } from '../api'
import { useAdminLogs } from './useAdminLogs'

vi.mock('../api')

type LogsSnapshot = Awaited<ReturnType<typeof fetchAdminLogs>>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function logsSnapshot(retainedFileCount: number): LogsSnapshot {
  return {
    event_count: 0,
    events: [],
    max_file_bytes: 1024,
    retained_file_count: retainedFileCount,
  }
}

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

  it('keeps the newest refresh when responses resolve out of order', async () => {
    const first = deferred<LogsSnapshot>()
    const second = deferred<LogsSnapshot>()
    vi.mocked(fetchAdminLogs)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useAdminLogs())
    await waitFor(() => expect(fetchAdminLogs).toHaveBeenCalledTimes(1))

    let latestRefresh!: Promise<void>
    act(() => {
      latestRefresh = result.current.refresh()
    })
    await waitFor(() => expect(fetchAdminLogs).toHaveBeenCalledTimes(2))
    await act(() => {
      second.resolve(logsSnapshot(2))
      return latestRefresh
    })
    await act(() => {
      first.resolve(logsSnapshot(1))
      return first.promise
    })

    expect(result.current.snapshot?.retained_file_count).toBe(2)
    expect(result.current.loading).toBe(false)
  })
})
