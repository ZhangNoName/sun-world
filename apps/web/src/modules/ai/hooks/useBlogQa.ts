import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import {
  blogQaMessage,
  blogQaMode,
  cancelBlogQaRun,
  deleteBlogQaHistory,
  normalizeBlogQaRun,
  fetchBlogQaCapabilities,
  fetchBlogQaRun,
  fetchLocalUser,
  loginLocalUser,
  logoutLocalUser,
  streamBlogQa,
  type BlogQaCapabilities,
  type BlogQaRun,
  type LocalUser,
} from '../blog-qa-api'

const accountFromState = (
  state = useAuthStore.getState()
): LocalUser | null => {
  const id = Number(state.user?.id)
  return state.status === 'authenticated' &&
    state.user &&
    Number.isSafeInteger(id) &&
    id > 0
    ? { user_id: id, display_name: state.user.username || '当前账号' }
    : null
}

function canEraseHistory(
  capabilities: BlogQaCapabilities | null,
  run: BlogQaRun | null,
  busy: boolean
) {
  return (
    blogQaMode(capabilities) === 'formal' &&
    capabilities?.authenticated === true &&
    run !== null &&
    run.status !== 'accepted' &&
    run.status !== 'running' &&
    !busy
  )
}

type HistoryDeletionStatus = 'idle' | 'pending' | 'failed' | 'deleted'

export function useBlogQa() {
  const [capabilities, setCapabilities] = useState<BlogQaCapabilities | null>(
    null
  )
  const [user, setUser] = useState<LocalUser | null>(null)
  const [run, setRun] = useState<BlogQaRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [historyDeletionStatus, setHistoryDeletionStatus] =
    useState<HistoryDeletionStatus>('idle')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const runGeneration = useRef(0)
  const mounted = useRef(false)
  const mode = useRef<ReturnType<typeof blogQaMode>>(null)
  const caps = useRef<BlogQaCapabilities | null>(null)
  const activeAccount = useRef<LocalUser | null>(null)
  const activeRun = useRef<BlogQaRun | null>(null)
  const busyRef = useRef(false)
  const requests = useRef(new Set<AbortController>())
  const stream = useRef<AbortController | null>(null)
  const historyDeletion = useRef<AbortController | null>(null)
  const current = useCallback(
    (epoch: number, account?: LocalUser) =>
      mounted.current &&
      generation.current === epoch &&
      (!account || activeAccount.current === account),
    []
  )
  const request = useCallback(() => {
    const abort = new AbortController()
    requests.current.add(abort)
    return abort
  }, [])
  const reset = useCallback(() => {
    const epoch = ++generation.current
    runGeneration.current++
    for (const abort of requests.current) abort.abort()
    requests.current.clear()
    stream.current = null
    historyDeletion.current = null
    activeAccount.current = activeRun.current = null
    caps.current = null
    busyRef.current = false
    setCapabilities(null)
    setUser(null)
    setRun(null)
    setBusy(false)
    setHistoryDeletionStatus('idle')
    setError('')
    return epoch
  }, [])
  const applyRun = useCallback(
    (value: BlogQaRun, account: LocalUser, epoch: number) => {
      if (!current(epoch, account)) return
      const next = normalizeBlogQaRun(value)
      activeRun.current = next
      sessionStorage.setItem(`blog-qa:${account.user_id}`, next.id)
      setRun(next)
    },
    [current]
  )
  const restore = useCallback(
    async (account: LocalUser, epoch: number, signal: AbortSignal) => {
      const id = sessionStorage.getItem(`blog-qa:${account.user_id}`)
      if (!id) return
      const revision = runGeneration.current
      const isCurrent = () =>
        current(epoch, account) && runGeneration.current === revision
      try {
        const restored = await fetchBlogQaRun(id, signal)
        if (isCurrent()) applyRun(restored, account, epoch)
      } catch {
        if (isCurrent() && !signal.aborted)
          sessionStorage.removeItem(`blog-qa:${account.user_id}`)
      }
    },
    [applyRun, current]
  )

  useEffect(() => {
    mounted.current = true
    let initializing = false
    const load = async (epoch: number, initialize: boolean) => {
      const abort = request()
      try {
        let value = await fetchBlogQaCapabilities(abort.signal)
        if (!current(epoch)) return
        const nextMode = blogQaMode(value)
        if (!nextMode) throw new Error('不支持的问答模式')
        mode.current = nextMode
        let account: LocalUser | null = null
        if (nextMode !== 'fixtures') {
          if (initialize && useAuthStore.getState().status !== 'anonymous') {
            initializing = true
            try {
              await useAuthStore.getState().restoreSession()
            } finally {
              initializing = false
            }
          }
          if (!current(epoch)) return
          // The store identity wins over any delayed restore return value.
          account = accountFromState()
          value = await fetchBlogQaCapabilities(abort.signal)
          if (blogQaMode(value) !== nextMode) throw new Error('问答模式已变化')
        } else if (value.authenticated) {
          account = await fetchLocalUser(abort.signal)
        }
        if (!current(epoch)) return
        caps.current = value
        activeAccount.current = account
        setCapabilities(value)
        setUser(account)
        if (account) await restore(account, epoch, abort.signal)
      } catch (failure) {
        if (current(epoch) && !abort.signal.aborted) {
          caps.current = null
          setCapabilities(null)
          setError(
            blogQaMessage(failure instanceof Error ? failure.message : null)
          )
        }
      } finally {
        requests.current.delete(abort)
      }
    }
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (mode.current === 'fixtures') return
      const nextId = accountFromState(state)?.user_id ?? null
      const previousId = accountFromState(previous)?.user_id ?? null
      const sessionChanged = state.sessionRevision !== previous.sessionRevision
      const changed =
        sessionChanged ||
        nextId !== previousId ||
        (state.status === 'anonymous' && previous.status !== 'anonymous')
      if (!changed) return
      // A successful initial restore publishes synchronously. This load owns
      // its follow-up work rather than invalidating itself on that one event.
      if (
        initializing &&
        !sessionChanged &&
        previousId === null &&
        nextId !== null &&
        activeAccount.current === null
      )
        return
      initializing = false
      void load(reset(), false)
    })
    void load(reset(), true)
    return () => {
      unsubscribe()
      mounted.current = false
      generation.current++
      activeAccount.current = null
      for (const abort of requests.current) abort.abort()
      requests.current.clear()
    }
  }, [current, request, reset, restore])

  const login = async () => {
    if (!mounted.current || mode.current !== 'fixtures') return
    const epoch = reset(),
      abort = request()
    try {
      const account = await loginLocalUser(abort.signal)
      if (!current(epoch)) return
      const value = await fetchBlogQaCapabilities(abort.signal)
      if (!current(epoch) || blogQaMode(value) !== 'fixtures') return
      caps.current = value
      activeAccount.current = account
      setCapabilities(value)
      setUser(account)
      await restore(account, epoch, abort.signal)
    } catch (failure) {
      if (current(epoch) && !abort.signal.aborted)
        setError(
          blogQaMessage(failure instanceof Error ? failure.message : null)
        )
    } finally {
      requests.current.delete(abort)
    }
  }
  const logout = async () => {
    if (!mounted.current) return
    const previous = caps.current
    const fixture = mode.current === 'fixtures'
    const epoch = reset(),
      abort = request()
    try {
      if (fixture) {
        await logoutLocalUser(abort.signal)
        if (current(epoch) && previous) {
          caps.current = { ...previous, authenticated: false }
          setCapabilities(caps.current)
        }
      } else await useAuthStore.getState().logout()
    } catch {
      if (current(epoch)) setError('退出请求未确认，请关闭页面并重新登录')
    } finally {
      requests.current.delete(abort)
    }
  }
  const send = async (question: string) => {
    const epoch = generation.current
    if (
      !user ||
      !current(epoch, user) ||
      busyRef.current ||
      historyDeletion.current ||
      !caps.current?.enabled ||
      !question.trim()
    )
      return
    const revision = ++runGeneration.current
    const abort = request()
    stream.current?.abort()
    stream.current = abort
    activeRun.current = null
    busyRef.current = true
    setRun(null)
    setBusy(true)
    setHistoryDeletionStatus('idle')
    setError('')
    const isCurrent = () =>
      current(epoch, user) &&
      runGeneration.current === revision &&
      stream.current === abort
    let terminal = false
    try {
      await streamBlogQa(question.trim(), abort.signal, (event) => {
        if (!isCurrent()) return
        if (event.type === 'run.started')
          applyRun(
            {
              id: String(event.data.run_id),
              status: 'running',
              question,
              sources: [],
            },
            user,
            epoch
          )
        if (event.type === 'message.completed' || event.type === 'run.failed') {
          terminal = true
          applyRun(normalizeBlogQaRun(event.data), user, epoch)
        }
      })
      if (!terminal && !abort.signal.aborted)
        throw new Error('stream_interrupted')
    } catch (failure) {
      if (isCurrent() && !abort.signal.aborted)
        setError(
          blogQaMessage(failure instanceof Error ? failure.message : null)
        )
    } finally {
      requests.current.delete(abort)
      if (isCurrent()) {
        busyRef.current = false
        setBusy(false)
        stream.current = null
      }
    }
  }
  const stop = async () => {
    const id = activeRun.current?.id,
      epoch = generation.current,
      revision = runGeneration.current,
      running = stream.current
    if (!user || !current(epoch, user) || historyDeletion.current) return
    const isCurrent = () =>
      current(epoch, user) &&
      runGeneration.current === revision &&
      stream.current === running &&
      activeRun.current?.id === id
    const abort = request()
    try {
      if (id) {
        const cancelled = await cancelBlogQaRun(id, abort.signal)
        if (isCurrent()) applyRun(cancelled, user, epoch)
      }
      if (isCurrent()) running?.abort()
    } catch {
      if (isCurrent() && !abort.signal.aborted)
        setError('取消未确认，请刷新运行状态')
    } finally {
      requests.current.delete(abort)
      if (isCurrent()) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }
  const refresh = async () => {
    const id = activeRun.current?.id,
      epoch = generation.current,
      revision = runGeneration.current
    if (!user || !id || !current(epoch, user) || historyDeletion.current) return
    const isCurrent = () =>
      current(epoch, user) &&
      runGeneration.current === revision &&
      activeRun.current?.id === id
    const abort = request()
    try {
      const next = await fetchBlogQaRun(id, abort.signal)
      if (isCurrent()) {
        applyRun(next, user, epoch)
        setError('')
      }
    } catch {
      if (isCurrent() && !abort.signal.aborted)
        setError('无法读取运行状态，请检查登录')
    } finally {
      requests.current.delete(abort)
    }
  }
  const deleteHistory = async (id: string) => {
    const epoch = generation.current
    if (
      !user ||
      !current(epoch, user) ||
      activeRun.current?.id !== id ||
      !canEraseHistory(caps.current, activeRun.current, busyRef.current) ||
      historyDeletion.current
    )
      return
    const revision = ++runGeneration.current
    for (const pending of requests.current) pending.abort()
    requests.current.clear()
    const abort = request()
    historyDeletion.current = abort
    stream.current = null
    setHistoryDeletionStatus('pending')
    setError('')
    const isCurrent = () =>
      current(epoch, user) &&
      runGeneration.current === revision &&
      historyDeletion.current === abort &&
      activeRun.current?.id === id
    try {
      await deleteBlogQaHistory(id, abort.signal)
      if (isCurrent()) {
        activeRun.current = null
        setRun(null)
        setHistoryDeletionStatus('deleted')
        const key = `blog-qa:${user.user_id}`
        if (sessionStorage.getItem(key) === id) sessionStorage.removeItem(key)
      }
    } catch {
      if (isCurrent() && !abort.signal.aborted)
        setHistoryDeletionStatus('failed')
    } finally {
      requests.current.delete(abort)
      if (historyDeletion.current === abort) historyDeletion.current = null
    }
  }
  return {
    capabilities,
    user,
    run,
    busy,
    canDeleteHistory: user !== null && canEraseHistory(capabilities, run, busy),
    historyDeletionStatus,
    error,
    login,
    logout,
    send,
    stop,
    refresh,
    deleteHistory,
  }
}
