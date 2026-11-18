import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useBlogQa } from './useBlogQa'
import * as api from '../blog-qa-api'
import { useAuthStore } from '@/store/auth'
import type { UserInfo } from '@/modules/account/types'
import formalContract from '../fixtures/formal-contract.json'
import { isAiStreamEvent, type AiStreamEvent } from '@sun-world/contracts'
vi.mock('../blog-qa-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../blog-qa-api')>()
  return {
    ...actual,
    fetchBlogQaCapabilities: vi.fn(),
    fetchBlogQaRun: vi.fn(),
    fetchLocalUser: vi.fn(),
    loginLocalUser: vi.fn(),
    logoutLocalUser: vi.fn(),
    cancelBlogQaRun: vi.fn(),
    deleteBlogQaHistory: vi.fn(),
    streamBlogQa: vi.fn(),
  }
})
const originalAuth = useAuthStore.getState()
const value = {
  enabled: true,
  authenticated: true,
  local_validation: true,
  dataset: 'test',
  model: 'test',
}
const user = { user_id: 1, display_name: 'local' }
const run = {
  id: 'r1',
  status: 'completed' as const,
  question: 'private question',
  answer: 'private answer',
  sources: [],
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(value)
  vi.mocked(api.fetchLocalUser).mockResolvedValue(user)
  vi.mocked(api.logoutLocalUser).mockResolvedValue({})
  useAuthStore.setState({
    user: null,
    status: 'unknown',
    restoreSession: vi.fn().mockResolvedValue(null),
    logout: vi.fn(async () => {
      useAuthStore.setState({ user: null, status: 'anonymous' })
    }),
  })
})
afterEach(() => {
  cleanup()
  useAuthStore.setState(originalAuth)
})
it('does not restore an old answer after logout', async () => {
  sessionStorage.setItem('blog-qa:1', 'r1')
  const pending = deferred<api.BlogQaRun>()
  vi.mocked(api.fetchBlogQaRun).mockReturnValue(pending.promise)
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() => expect(result.current.user).toEqual(user))
  await act(() => result.current.logout())
  await act(async () => pending.resolve(run))
  expect(result.current.user).toBeNull()
  expect(result.current.run).toBeNull()
})
it('does not refresh an old answer after logout', async () => {
  sessionStorage.setItem('blog-qa:1', 'r1')
  vi.mocked(api.fetchBlogQaRun).mockResolvedValueOnce(run)
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() => expect(result.current.run).toEqual(run))
  const pending = deferred<api.BlogQaRun>()
  vi.mocked(api.fetchBlogQaRun).mockReturnValue(pending.promise)
  let refresh!: Promise<void>
  act(() => {
    refresh = result.current.refresh()
  })
  await act(() => result.current.logout())
  await act(async () => {
    pending.resolve(run)
    await refresh
  })
  expect(result.current.user).toBeNull()
  expect(result.current.run).toBeNull()
})
it('ignores a login response that arrives after logout', async () => {
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue({
    ...value,
    authenticated: false,
  })
  const pending = deferred<api.LocalUser>()
  vi.mocked(api.loginLocalUser).mockReturnValue(pending.promise)
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() => expect(result.current.capabilities).not.toBeNull())
  let login!: Promise<void>
  act(() => {
    login = result.current.login()
  })
  await act(() => result.current.logout())
  await act(async () => {
    pending.resolve(user)
    await login
  })
  expect(result.current.user).toBeNull()
})
it('uses AuthStore for formal capabilities and never fetches a local session', async () => {
  const real = { id: 7, username: '正常账号' } as UserInfo
  const restoreSession = vi.fn().mockResolvedValue(real)
  useAuthStore.setState({ user: real, status: 'authenticated', restoreSession })
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue({
    ...value,
    mode: 'formal',
    local_validation: false,
  })
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() => expect(result.current.user?.user_id).toBe(7))
  expect(restoreSession).toHaveBeenCalled()
  expect(api.fetchLocalUser).not.toHaveBeenCalled()
})
const formal = formalContract.cases[0].capabilities.body
  .data as api.BlogQaCapabilities
function authenticate(id: number) {
  useAuthStore.setState({
    user: { id, username: `账号${id}` } as UserInfo,
    status: 'authenticated',
  })
}
function formalEvent(index: number): AiStreamEvent {
  const event: unknown = formalContract.cases[0].events[index]
  if (!isAiStreamEvent(event)) throw new Error('合同事件格式不完整')
  return event
}
it('finishes initial AuthStore restoration when its own subscription publishes the account', async () => {
  const restored = deferred<UserInfo | null>()
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
  useAuthStore.setState({
    restoreSession: vi.fn(async () => {
      useAuthStore.setState({ status: 'restoring' })
      const account = await restored.promise
      useAuthStore.setState({ user: account, status: 'authenticated' })
      return account
    }),
  })
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() =>
    expect(useAuthStore.getState().restoreSession).toHaveBeenCalledOnce()
  )
  await act(async () =>
    restored.resolve({ id: 7, username: '账号7' } as UserInfo)
  )
  await waitFor(() => expect(result.current.user?.user_id).toBe(7))
  expect(result.current.capabilities?.mode).toBe('formal')
  expect(api.fetchLocalUser).not.toHaveBeenCalled()
})
it('aborts an account restore and ignores its delayed history after switching accounts', async () => {
  authenticate(7)
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
  sessionStorage.setItem('blog-qa:7', 'old-run')
  const pending = deferred<api.BlogQaRun>()
  vi.mocked(api.fetchBlogQaRun).mockReturnValue(pending.promise)
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() => expect(api.fetchBlogQaRun).toHaveBeenCalledOnce())
  const signal = vi.mocked(api.fetchBlogQaRun).mock.calls[0][1]
  act(() => authenticate(8))
  await waitFor(() => expect(result.current.user?.user_id).toBe(8))
  expect(signal?.aborted).toBe(true)
  await act(async () => pending.resolve(run))
  expect(result.current.run).toBeNull()
  expect(sessionStorage.getItem('blog-qa:8')).toBeNull()
})
it('rejects old stream and cancel callbacks after an account change and aborts on unmount', async () => {
  authenticate(7)
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
  const streamDone = deferred<void>()
  const cancelled = deferred<api.BlogQaRun>()
  let callback!: (event: AiStreamEvent) => void
  let streamSignal!: AbortSignal
  vi.mocked(api.streamBlogQa).mockImplementation(
    async (_question, signal, onEvent) => {
      callback = onEvent
      streamSignal = signal
      onEvent(formalEvent(0))
      await streamDone.promise
    }
  )
  vi.mocked(api.cancelBlogQaRun).mockReturnValue(cancelled.promise)
  const { result, unmount } = renderHook(() => useBlogQa())
  await waitFor(() => expect(result.current.user?.user_id).toBe(7))
  let sending!: Promise<void>, stopping!: Promise<void>
  act(() => {
    sending = result.current.send('公开问题')
  })
  act(() => {
    stopping = result.current.stop()
  })
  const cancelSignal = vi.mocked(api.cancelBlogQaRun).mock.calls[0][1]
  act(() => authenticate(8))
  await waitFor(() => expect(result.current.user?.user_id).toBe(8))
  expect(streamSignal.aborted).toBe(true)
  expect(cancelSignal?.aborted).toBe(true)
  await act(async () => {
    callback(formalEvent(1))
    cancelled.resolve(run)
    streamDone.resolve()
    await Promise.all([sending, stopping])
  })
  expect(result.current.run).toBeNull()
  expect(result.current.busy).toBe(false)
  const pendingCaps = deferred<api.BlogQaCapabilities>()
  vi.mocked(api.fetchBlogQaCapabilities).mockReturnValue(pendingCaps.promise)
  act(() => authenticate(9))
  const capsSignal = vi
    .mocked(api.fetchBlogQaCapabilities)
    .mock.calls.at(-1)?.[0]
  unmount()
  expect(capsSignal?.aborted).toBe(true)
  await act(async () => pendingCaps.resolve(formal))
})
it('does not revive a delayed initial restore after logout followed by a different login', async () => {
  const old = deferred<UserInfo | null>()
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
  useAuthStore.setState({
    restoreSession: vi.fn().mockReturnValue(old.promise),
  })
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() =>
    expect(useAuthStore.getState().restoreSession).toHaveBeenCalledOnce()
  )
  act(() => useAuthStore.setState({ user: null, status: 'anonymous' }))
  act(() => authenticate(8))
  await waitFor(() => expect(result.current.user?.user_id).toBe(8))
  await act(async () => old.resolve({ id: 7, username: '旧账号' } as UserInfo))
  expect(result.current.user?.user_id).toBe(8)
})
it('refuses sends when formal admission is disabled and preserves explicit fixture login', async () => {
  authenticate(7)
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue({
    ...formal,
    enabled: false,
  })
  const first = renderHook(() => useBlogQa())
  await waitFor(() => expect(first.result.current.user?.user_id).toBe(7))
  await act(() => first.result.current.send('问题'))
  expect(api.streamBlogQa).not.toHaveBeenCalled()
  first.unmount()
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue({
    ...value,
    mode: 'fixtures',
    authenticated: false,
  })
  vi.mocked(api.loginLocalUser).mockResolvedValue(user)
  const second = renderHook(() => useBlogQa())
  await waitFor(() =>
    expect(second.result.current.capabilities?.mode).toBe('fixtures')
  )
  await act(() => second.result.current.login())
  expect(second.result.current.user).toEqual(user)
  expect(api.loginLocalUser).toHaveBeenCalledOnce()
})
it.each(['success', 'failure'] as const)(
  'isolates a late %s from the previous run cancellation',
  async (outcome) => {
    authenticate(7)
    vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
    const cancelled = deferred<api.BlogQaRun>()
    const completed = [deferred<void>(), deferred<void>()]
    const callbacks: ((event: AiStreamEvent) => void)[] = []
    const signals: AbortSignal[] = []
    vi.mocked(api.cancelBlogQaRun).mockReturnValue(cancelled.promise)
    vi.mocked(api.streamBlogQa).mockImplementation(
      async (_question, signal, callback) => {
        const index = callbacks.length
        callbacks.push(callback)
        signals.push(signal)
        callback({ ...formalEvent(0), data: { run_id: `r${index + 1}` } })
        await completed[index].promise
      }
    )
    const { result } = renderHook(() => useBlogQa())
    await waitFor(() => expect(result.current.user?.user_id).toBe(7))
    let first!: Promise<void>, second!: Promise<void>, stopping!: Promise<void>
    act(() => {
      first = result.current.send('问题一')
    })
    act(() => {
      stopping = result.current.stop()
    })
    await act(async () => {
      callbacks[0]({ ...formalEvent(1), data: { ...run } })
      completed[0].resolve()
      await first
    })
    expect(result.current.busy).toBe(false)
    act(() => {
      second = result.current.send('问题二')
    })
    expect(result.current.run?.id).toBe('r2')
    await act(async () => {
      if (outcome === 'success')
        cancelled.resolve({ ...run, status: 'cancelled' })
      else cancelled.reject(new Error('cancel failed'))
      await stopping
    })
    expect(result.current.run?.id).toBe('r2')
    expect(sessionStorage.getItem('blog-qa:7')).toBe('r2')
    expect(result.current.busy).toBe(true)
    expect(result.current.error).toBe('')
    expect(signals[1].aborted).toBe(false)
    await act(async () => {
      callbacks[1]({ ...formalEvent(1), data: { ...run, id: 'r2' } })
      completed[1].resolve()
      await second
    })
  }
)
it.each([false, true])(
  'keeps cancellation behavior when run.started is present: %s',
  async (started) => {
    const done = deferred<void>()
    let signal!: AbortSignal
    vi.mocked(api.streamBlogQa).mockImplementation(
      async (_question, currentSignal, callback) => {
        signal = currentSignal
        if (started) callback({ ...formalEvent(0), data: { run_id: 'r1' } })
        await done.promise
      }
    )
    vi.mocked(api.cancelBlogQaRun).mockRejectedValue(new Error('cancel failed'))
    const { result } = renderHook(() => useBlogQa())
    await waitFor(() => expect(result.current.user).toEqual(user))
    let sending!: Promise<void>
    act(() => {
      sending = result.current.send('问题')
    })
    await act(() => result.current.stop())
    expect(result.current.busy).toBe(false)
    if (started) {
      expect(api.cancelBlogQaRun).toHaveBeenCalledOnce()
      expect(result.current.error).toBe('取消未确认，请刷新运行状态')
      expect(signal.aborted).toBe(false)
    } else {
      expect(api.cancelBlogQaRun).not.toHaveBeenCalled()
      expect(signal.aborted).toBe(true)
      expect(result.current.error).toBe('')
    }
    await act(async () => {
      done.resolve()
      await sending
    })
  }
)
it.each(['success', 'failure'] as const)(
  'does not let a late saved-run restore %s affect a new run',
  async (outcome) => {
    authenticate(7)
    vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
    sessionStorage.setItem('blog-qa:7', 'saved')
    const restored = deferred<api.BlogQaRun>(),
      done = deferred<void>()
    vi.mocked(api.fetchBlogQaRun).mockReturnValue(restored.promise)
    vi.mocked(api.streamBlogQa).mockImplementation(
      async (_question, _signal, callback) => {
        callback({ ...formalEvent(0), data: { run_id: 'new-run' } })
        await done.promise
      }
    )
    const { result } = renderHook(() => useBlogQa())
    await waitFor(() => expect(api.fetchBlogQaRun).toHaveBeenCalledOnce())
    let sending!: Promise<void>
    act(() => {
      sending = result.current.send('新问题')
    })
    await act(async () => {
      if (outcome === 'success') restored.resolve({ ...run, id: 'saved' })
      else restored.reject(new Error('restore failed'))
    })
    expect(result.current.run?.id).toBe('new-run')
    expect(sessionStorage.getItem('blog-qa:7')).toBe('new-run')
    expect(result.current.error).toBe('')
    expect(result.current.busy).toBe(true)
    await act(async () => {
      done.resolve()
      await sending
    })
  }
)
it('ignores an old refresh failure after starting another run', async () => {
  sessionStorage.setItem('blog-qa:1', 'r1')
  const refreshed = deferred<api.BlogQaRun>(),
    done = deferred<void>()
  vi.mocked(api.fetchBlogQaRun)
    .mockResolvedValueOnce(run)
    .mockReturnValueOnce(refreshed.promise)
  const { result } = renderHook(() => useBlogQa())
  await waitFor(() => expect(result.current.run?.id).toBe('r1'))
  let refreshing!: Promise<void>, sending!: Promise<void>
  act(() => {
    refreshing = result.current.refresh()
  })
  vi.mocked(api.streamBlogQa).mockImplementation(
    async (_question, _signal, callback) => {
      callback({ ...formalEvent(0), data: { run_id: 'new-run' } })
      await done.promise
    }
  )
  act(() => {
    sending = result.current.send('新问题')
  })
  await act(async () => {
    refreshed.reject(new Error('refresh failed'))
    await refreshing
  })
  expect(result.current.run?.id).toBe('new-run')
  expect(sessionStorage.getItem('blog-qa:1')).toBe('new-run')
  expect(result.current.error).toBe('')
  expect(result.current.busy).toBe(true)
  await act(async () => {
    done.resolve()
    await sending
  })
})
it.each(['restore', 'refresh'] as const)(
  'does not revive an old %s after a new send fails before run.started',
  async (operation) => {
    sessionStorage.setItem('blog-qa:1', 'r1')
    const old = deferred<api.BlogQaRun>()
    if (operation === 'refresh')
      vi.mocked(api.fetchBlogQaRun).mockResolvedValueOnce(run)
    vi.mocked(api.fetchBlogQaRun).mockReturnValue(old.promise)
    vi.mocked(api.streamBlogQa).mockRejectedValue(
      new Error('AGENT_MODEL_FAILED')
    )
    const { result } = renderHook(() => useBlogQa())
    await waitFor(() => expect(result.current.user).toEqual(user))
    let refreshing: Promise<void> | undefined
    if (operation === 'refresh') {
      await waitFor(() => expect(result.current.run?.id).toBe('r1'))
      act(() => {
        refreshing = result.current.refresh()
      })
    }
    await act(() => result.current.send('新问题'))
    const error = result.current.error
    expect(error).toBe('模型服务暂不可用，请稍后重新提问')
    await act(async () => {
      old.resolve(run)
      await refreshing
    })
    expect(result.current.run).toBeNull()
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBe(error)
    expect(sessionStorage.getItem('blog-qa:1')).toBe('r1')
  }
)

async function restoreFormalRun(
  savedRun: api.BlogQaRun = run,
  capabilities = formal
) {
  authenticate(7)
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(capabilities)
  sessionStorage.setItem('blog-qa:7', savedRun.id)
  vi.mocked(api.fetchBlogQaRun).mockResolvedValueOnce(savedRun)
  const hook = renderHook(useBlogQa)
  await waitFor(() => expect(hook.result.current.run).toEqual(savedRun))
  return hook
}

it('keeps the result on failure and clears it only when the same deletion is confirmed', async () => {
  const { result } = await restoreFormalRun()
  vi.mocked(api.deleteBlogQaHistory)
    .mockRejectedValueOnce(new Error('request failed'))
    .mockResolvedValueOnce(undefined)

  await act(() => result.current.deleteHistory('r1'))
  expect(result.current.run).toEqual(run)
  expect(result.current.historyDeletionStatus).toBe('failed')
  expect(sessionStorage.getItem('blog-qa:7')).toBe('r1')

  await act(() => result.current.deleteHistory('r1'))
  expect(result.current.run).toBeNull()
  expect(result.current.error).toBe('')
  expect(result.current.historyDeletionStatus).toBe('deleted')
  expect(sessionStorage.getItem('blog-qa:7')).toBeNull()
  expect(api.deleteBlogQaHistory).toHaveBeenCalledTimes(2)
})

it('blocks concurrent run operations and ignores refresh and cancel responses sent before deletion', async () => {
  const { result } = await restoreFormalRun()
  const refreshed = deferred<api.BlogQaRun>()
  const cancelled = deferred<api.BlogQaRun>()
  const deleted = deferred<void>()
  vi.mocked(api.fetchBlogQaRun).mockReturnValue(refreshed.promise)
  vi.mocked(api.cancelBlogQaRun).mockReturnValue(cancelled.promise)
  vi.mocked(api.deleteBlogQaHistory).mockReturnValue(deleted.promise)
  let refreshing!: Promise<void>
  let stopping!: Promise<void>
  let deleting!: Promise<void>
  act(() => {
    refreshing = result.current.refresh()
    stopping = result.current.stop()
    deleting = result.current.deleteHistory('r1')
  })
  expect(result.current.historyDeletionStatus).toBe('pending')
  expect(result.current.run).toEqual(run)
  expect(vi.mocked(api.fetchBlogQaRun).mock.lastCall?.[1]?.aborted).toBe(true)
  expect(vi.mocked(api.cancelBlogQaRun).mock.lastCall?.[1]?.aborted).toBe(true)
  await act(async () => {
    await Promise.all([
      result.current.deleteHistory('r1'),
      result.current.send('新问题'),
      result.current.refresh(),
      result.current.stop(),
    ])
  })
  expect(api.deleteBlogQaHistory).toHaveBeenCalledOnce()
  expect(api.streamBlogQa).not.toHaveBeenCalled()
  expect(api.fetchBlogQaRun).toHaveBeenCalledTimes(2)
  expect(api.cancelBlogQaRun).toHaveBeenCalledOnce()

  await act(async () => {
    deleted.resolve()
    await deleting
    refreshed.resolve(run)
    cancelled.resolve(run)
    await Promise.all([refreshing, stopping])
  })
  expect(result.current.run).toBeNull()
  expect(sessionStorage.getItem('blog-qa:7')).toBeNull()
})

it('keeps deletion available when new runs are unavailable and requires the displayed run ID', async () => {
  const { result } = await restoreFormalRun(run, { ...formal, enabled: false })
  vi.mocked(api.deleteBlogQaHistory).mockResolvedValue(undefined)
  expect(result.current.canDeleteHistory).toBe(true)
  await act(() => result.current.deleteHistory('older-run'))
  expect(api.deleteBlogQaHistory).not.toHaveBeenCalled()
  await act(() => result.current.deleteHistory(run.id))
  expect(api.deleteBlogQaHistory).toHaveBeenCalledOnce()
  expect(result.current.run).toBeNull()
})

it.each([
  ['site', 'completed', true],
  ['formal', 'running', true],
  ['formal', 'accepted', true],
  ['formal', 'completed', false],
] as const)(
  'refuses deletion for mode %s, status %s, authenticated %s',
  async (mode, status, authenticated) => {
    const { result } = await restoreFormalRun(
      { ...run, status },
      { ...formal, mode, authenticated }
    )
    expect(result.current.canDeleteHistory).toBe(false)
    await act(() => result.current.deleteHistory('r1'))
    expect(api.deleteBlogQaHistory).not.toHaveBeenCalled()
  }
)

it('never enables history deletion in fixture mode', async () => {
  sessionStorage.setItem('blog-qa:1', 'r1')
  vi.mocked(api.fetchBlogQaRun).mockResolvedValueOnce(run)
  const { result } = renderHook(useBlogQa)
  await waitFor(() => expect(result.current.run).toEqual(run))
  expect(result.current.canDeleteHistory).toBe(false)
  await act(() => result.current.deleteHistory('r1'))
  expect(api.deleteBlogQaHistory).not.toHaveBeenCalled()
})

it.each(['confirmed', 'failed'] as const)(
  'isolates a %s deletion after a same-account session change',
  async (outcome) => {
    const { result } = await restoreFormalRun()
    const deleted = deferred<void>()
    vi.mocked(api.deleteBlogQaHistory).mockReturnValue(deleted.promise)
    const previous = result.current
    let deleting!: Promise<void>
    act(() => {
      deleting = previous.deleteHistory('r1')
    })
    const signal = vi.mocked(api.deleteBlogQaHistory).mock.calls[0][1]
    const newRun = { ...run, answer: '当前会话重新查到的答案' }
    vi.mocked(api.fetchBlogQaRun).mockResolvedValueOnce(newRun)
    act(() =>
      useAuthStore.setState((state) => ({
        sessionRevision: state.sessionRevision + 1,
      }))
    )
    expect(result.current.run).toBeNull()
    expect(signal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.run).toEqual(newRun))
    await act(() => previous.deleteHistory('r1'))
    expect(api.deleteBlogQaHistory).toHaveBeenCalledOnce()
    await act(async () => {
      if (outcome === 'confirmed') deleted.resolve()
      else deleted.reject(new Error('late error'))
      await deleting
    })
    expect(result.current.run).toEqual(newRun)
    expect(result.current.error).toBe('')
    expect(result.current.historyDeletionStatus).toBe('idle')
    expect(sessionStorage.getItem('blog-qa:7')).toBe('r1')
  }
)

it('ignores a saved run arriving after same-account reauthentication', async () => {
  authenticate(7)
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(formal)
  sessionStorage.setItem('blog-qa:7', 'r1')
  const old = deferred<api.BlogQaRun>()
  vi.mocked(api.fetchBlogQaRun)
    .mockReturnValueOnce(old.promise)
    .mockRejectedValueOnce(new Error('not found in new session family'))
  const { result } = renderHook(useBlogQa)
  await waitFor(() => expect(api.fetchBlogQaRun).toHaveBeenCalledOnce())
  const signal = vi.mocked(api.fetchBlogQaRun).mock.calls[0][1]
  act(() =>
    useAuthStore.setState((state) => ({
      sessionRevision: state.sessionRevision + 1,
    }))
  )
  expect(signal?.aborted).toBe(true)
  await waitFor(() => expect(sessionStorage.getItem('blog-qa:7')).toBeNull())
  await act(async () => old.resolve(run))
  expect(result.current.run).toBeNull()
  expect(result.current.canDeleteHistory).toBe(false)
  expect(sessionStorage.getItem('blog-qa:7')).toBeNull()
})
