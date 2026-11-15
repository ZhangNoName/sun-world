import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import {
  cancelBlogQaRun,
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

export function useBlogQa() {
  const [capabilities, setCapabilities] = useState<BlogQaCapabilities | null>(
    null
  )
  const [user, setUser] = useState<LocalUser | null>(null)
  const [run, setRun] = useState<BlogQaRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const activeRun = useRef<string | null>(null)
  const accountId = useRef<number | null>(null)
  const siteMode = useRef(false)
  const generation = useRef(0)
  const current = useCallback(
    (epoch: number, account?: LocalUser) =>
      generation.current === epoch &&
      (!account || accountId.current === account.user_id),
    []
  )

  const applyRun = useCallback(
    (next: BlogQaRun, account: LocalUser, epoch: number) => {
      if (!current(epoch, account)) return
      activeRun.current = next.id
      sessionStorage.setItem(`blog-qa:${account.user_id}`, next.id)
      setRun(next)
    },
    [current]
  )
  const restore = useCallback(
    async (account: LocalUser, epoch: number) => {
      const id = sessionStorage.getItem(`blog-qa:${account.user_id}`)
      if (!id) return
      try {
        applyRun(await fetchBlogQaRun(id), account, epoch)
      } catch {
        if (current(epoch, account))
          sessionStorage.removeItem(`blog-qa:${account.user_id}`)
      }
    },
    [applyRun, current]
  )

  useEffect(() => {
    const epoch = ++generation.current
    void fetchBlogQaCapabilities()
      .then(async (value) => {
        if (!current(epoch)) return
        siteMode.current = value.mode === 'site'
        setCapabilities(value)
        if (siteMode.current || value.authenticated) {
          const real = siteMode.current
            ? await useAuthStore.getState().restoreSession()
            : null
          const account = siteMode.current
            ? real
              ? {
                  user_id: Number(real.id),
                  display_name: real.username || '当前账号',
                }
              : null
            : await fetchLocalUser()
          if (!account) return
          if (!current(epoch)) return
          accountId.current = account.user_id
          setUser(account)
          await restore(account, epoch)
          if (siteMode.current && current(epoch, account)) {
            const updated = await fetchBlogQaCapabilities()
            if (current(epoch, account)) setCapabilities(updated)
          }
        }
      })
      .catch(() => {
        if (current(epoch))
          setError('博客问答服务未就绪，请使用本地启动命令后刷新')
      })
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!siteMode.current) return
      const nextId = state.user ? Number(state.user.id) : null
      if (
        state.status === 'anonymous' ||
        (accountId.current !== null && nextId !== accountId.current)
      ) {
        generation.current += 1
        accountId.current = null
        activeRun.current = null
        controller.current?.abort()
        setUser(null)
        setRun(null)
        setBusy(false)
      }
    })
    return () => {
      unsubscribe()
      generation.current += 1
      accountId.current = null
      controller.current?.abort()
    }
  }, [current, restore])

  const login = async () => {
    const epoch = ++generation.current
    setError('')
    try {
      const account = await loginLocalUser()
      if (!current(epoch)) return
      accountId.current = account.user_id
      setUser(account)
      await restore(account, epoch)
    } catch (failure) {
      if (current(epoch))
        setError(failure instanceof Error ? failure.message : '登录失败')
    }
  }
  const logout = async () => {
    const epoch = ++generation.current
    controller.current?.abort()
    accountId.current = null
    activeRun.current = null
    setUser(null)
    setRun(null)
    setBusy(false)
    try {
      if (siteMode.current) await useAuthStore.getState().logout()
      else await logoutLocalUser()
    } catch {
      if (current(epoch)) setError('退出请求未确认，请关闭页面并重新登录')
    }
  }
  const send = async (question: string) => {
    if (!user || busy || !question.trim()) return
    const epoch = ++generation.current
    const abort = new AbortController()
    controller.current = abort
    activeRun.current = null
    setRun(null)
    setBusy(true)
    setError('')
    let terminal = false
    try {
      await streamBlogQa(question.trim(), abort.signal, (event) => {
        if (!current(epoch, user)) return
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
        throw new Error('连接中断，请刷新运行状态')
    } catch (failure) {
      if (current(epoch, user) && !abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : '问答失败')
    } finally {
      if (current(epoch, user)) setBusy(false)
    }
  }
  const stop = async () => {
    const id = activeRun.current
    const epoch = generation.current
    const abort = controller.current
    try {
      if (id && user) applyRun(await cancelBlogQaRun(id), user, epoch)
      abort?.abort()
    } catch {
      if (current(epoch, user || undefined))
        setError('取消未确认，请刷新运行状态')
    }
    if (current(epoch, user || undefined)) setBusy(false)
  }
  const refresh = async () => {
    const id = activeRun.current
    const epoch = generation.current
    if (!user || !id) return
    try {
      const next = await fetchBlogQaRun(id)
      if (activeRun.current !== id) return
      applyRun(next, user, epoch)
      if (current(epoch, user)) setError('')
    } catch {
      if (current(epoch, user)) setError('无法读取运行状态，请检查登录')
    }
  }
  return {
    capabilities,
    user,
    run,
    busy,
    error,
    login,
    logout,
    send,
    stop,
    refresh,
  }
}
