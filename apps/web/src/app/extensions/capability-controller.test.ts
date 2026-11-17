import { CapabilityController } from './capability-controller'
import type { CapabilityProjection } from '@/modules/account/types'

function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const firstScope = {
  key: 'sun-world:authenticated:1:1',
  accountId: '1',
  active: true,
}
function projection(
  changes: Partial<CapabilityProjection> = {}
): CapabilityProjection {
  return {
    app_id: 'sun-world',
    account_id: '1',
    session_ref: 'a'.repeat(64),
    capabilities: ['identity.role.create'],
    max_age_seconds: 15,
    ...changes,
  }
}
const flush = async () => {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => {
  vi.useRealTimers()
})

it('starts only for demand, shares one request, and idempotently releases the final consumer', async () => {
  const fetcher = vi.fn(async () => projection())
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  await flush()
  expect(fetcher).not.toHaveBeenCalled()
  const releaseOne = controller.acquire()
  const releaseTwo = controller.acquire()
  await flush()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(controller.getSnapshot().capabilities.status).toBe('ready')
  releaseOne()
  releaseOne()
  expect(controller.getSnapshot().capabilities.status).toBe('ready')
  releaseTwo()
  expect(controller.getSnapshot().capabilities.status).toBe('unknown')
  expect(vi.getTimerCount()).toBe(0)
})

it('does not request while auth is restoring or a page is hidden', async () => {
  const fetcher = vi.fn(async () => projection())
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope({ ...firstScope, active: false })
  const release = controller.acquire()
  await flush()
  expect(fetcher).not.toHaveBeenCalled()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  controller.setScope({ ...firstScope, key: 'next' })
  await flush()
  expect(fetcher).not.toHaveBeenCalled()
  release()
})

it('aborts the old account request and ignores its late result even when transport ignores abort', async () => {
  const old = pending<CapabilityProjection>()
  const next = pending<CapabilityProjection>()
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise)
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  const oldSignal = fetcher.mock.calls[0][0] as AbortSignal
  controller.setScope({ ...firstScope, key: 'account2', accountId: '2' })
  expect(oldSignal.aborted).toBe(true)
  await flush()
  next.resolve(projection({ account_id: '2', session_ref: 'b'.repeat(64) }))
  await flush()
  const current = controller.getSnapshot()
  old.resolve(projection())
  await flush()
  expect(controller.getSnapshot()).toBe(current)
  release()
})

it('rejects a valid-shaped response belonging to another account', async () => {
  const controller = new CapabilityController(
    async () => projection({ account_id: '2' }),
    Date.now
  )
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  expect(controller.getSnapshot().capabilities.status).toBe('error')
  expect(controller.getSnapshot().sessionRef).toBeNull()
  release()
})

it('renews stable grants without replacing the snapshot or extending stale ready while renewal hangs', async () => {
  const renewal = pending<CapabilityProjection>()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(projection())
    .mockReturnValueOnce(renewal.promise)
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  const ready = controller.getSnapshot()
  await vi.advanceTimersByTimeAsync(12_000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(controller.getSnapshot()).toBe(ready)
  await vi.advanceTimersByTimeAsync(3000)
  expect(controller.getSnapshot().capabilities.status).toBe('unknown')
  renewal.resolve(projection())
  await flush()
  expect(controller.getSnapshot().capabilities.status).toBe('ready')
  release()
})

it('does not restart a response TTL at arrival or cache a zero TTL', async () => {
  for (const ttl of [0, 1]) {
    const response = pending<CapabilityProjection>()
    const controller = new CapabilityController(
      () => response.promise,
      Date.now
    )
    controller.setScope(firstScope)
    const release = controller.acquire()
    await flush()
    await vi.advanceTimersByTimeAsync(2000)
    response.resolve(projection({ max_age_seconds: ttl }))
    await flush()
    expect(controller.getSnapshot().capabilities.status).toBe('unknown')
    release()
  }
})

it('preserves identity for identical renewal and replaces server-family isolation for a new family', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(projection())
    .mockResolvedValueOnce(projection())
    .mockResolvedValueOnce(projection({ session_ref: 'b'.repeat(64) }))
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  const ready = controller.getSnapshot()
  await vi.advanceTimersByTimeAsync(12_000)
  expect(controller.getSnapshot()).toBe(ready)
  await vi.advanceTimersByTimeAsync(12_000)
  expect(controller.getSnapshot().sessionRef).toBe('b'.repeat(64))
  release()
})

it('removes ready grants on failed renewal and waits a bounded delay before retrying', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(projection())
    .mockRejectedValue(new Error('private'))
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  await vi.advanceTimersByTimeAsync(12_000)
  expect(controller.getSnapshot().capabilities.status).toBe('error')
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(4999)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(fetcher).toHaveBeenCalledTimes(3)
  release()
})

it('invalidates synchronously on focus, hidden abort, and visible recheck', async () => {
  const response = pending<CapabilityProjection>()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(projection())
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce(projection())
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  window.dispatchEvent(new Event('focus'))
  expect(controller.getSnapshot().capabilities.status).toBe('loading')
  await flush()
  const signal = fetcher.mock.calls[1][0] as AbortSignal
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(signal.aborted).toBe(true)
  response.resolve(projection())
  await flush()
  expect(controller.getSnapshot().capabilities.status).toBe('unknown')
  visibility.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  await flush()
  expect(controller.getSnapshot().capabilities.status).toBe('ready')
  release()
})

it('times out a hung fetch, rejects a late result, and leaves no reader or timer on unmount', async () => {
  const response = pending<CapabilityProjection>()
  const fetcher = vi.fn((_signal: AbortSignal) => response.promise)
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  const signal = fetcher.mock.calls[0][0] as AbortSignal
  await vi.advanceTimersByTimeAsync(8000)
  expect(signal.aborted).toBe(true)
  expect(controller.getSnapshot().capabilities.status).toBe('error')
  response.resolve(projection())
  await flush()
  expect(controller.getSnapshot().capabilities.status).toBe('error')
  release()
  expect(vi.getTimerCount()).toBe(0)
})

it('synchronously clips expired grants even when the browser has not delivered any timers', async () => {
  let monotonic = 0
  const controller = new CapabilityController(
    async () => projection(),
    () => monotonic
  )
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  expect(controller.getSnapshot().capabilities.status).toBe('ready')
  monotonic = 15_000
  const expired = controller.getSnapshot()
  expect(expired.capabilities.status).toBe('unknown')
  expect(controller.getSnapshot()).toBe(expired)
  release()
})

it('changes isolation for a verified zero-TTL new family without granting anything', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(projection())
    .mockResolvedValueOnce(
      projection({ session_ref: 'b'.repeat(64), max_age_seconds: 0 })
    )
  const controller = new CapabilityController(fetcher, Date.now)
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  await vi.advanceTimersByTimeAsync(12_000)
  expect(controller.getSnapshot().capabilities.status).toBe('unknown')
  expect(controller.getSnapshot().sessionRef).toBe('b'.repeat(64))
  release()
})

it('notifies renewed readiness after a synchronous expired read with delayed browser timers', async () => {
  let monotonic = 0
  const controller = new CapabilityController(
    async () => projection(),
    () => monotonic
  )
  controller.setScope(firstScope)
  const release = controller.acquire()
  await flush()
  monotonic = 16_000
  expect(controller.getSnapshot().capabilities.status).toBe('unknown')
  const listener = vi.fn()
  const unsubscribe = controller.subscribe(listener)
  await vi.advanceTimersByTimeAsync(12_000)
  expect(controller.getSnapshot().capabilities.status).toBe('ready')
  expect(listener).toHaveBeenCalledTimes(1)
  unsubscribe()
  release()
})

it('rejects anonymous management grants before publishing ready', async () => {
  const controller = new CapabilityController(
    async () =>
      projection({
        account_id: null,
        session_ref: null,
        capabilities: ['identity.role.create'],
      }),
    Date.now
  )
  controller.setScope({
    key: 'sun-world:anonymous:1',
    accountId: null,
    active: true,
  })
  const release = controller.acquire()
  try {
    await flush()
    expect(controller.getSnapshot().capabilities.status).toBe('error')
  } finally {
    release()
  }
})
