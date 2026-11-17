import type { CapabilityProjection } from '@/modules/account/types'
import { validateCapabilityProjection } from '@/modules/account/api'
import type { CapabilityState } from '@/shared/extensions'

export interface ProjectionScope {
  key: string
  accountId: string | null
  active: boolean
}
export interface ProjectionSnapshot {
  scopeKey: string
  capabilities: CapabilityState
  sessionRef: string | null
}

const INITIAL: ProjectionSnapshot = {
  scopeKey: '',
  capabilities: { status: 'unknown' },
  sessionRef: null,
}

/** A consumer-owned display cache. It never changes authentication state. */
export class CapabilityController {
  private scope: ProjectionScope = { key: '', accountId: null, active: false }
  private snapshot = INITIAL
  private expiredSnapshot = INITIAL
  private validUntil = 0
  private listeners = new Set<() => void>()
  private consumers = 0
  private generation = 0
  private request: AbortController | null = null
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private expiry: ReturnType<typeof setTimeout> | null = null
  private visible = () =>
    typeof document !== 'undefined' && document.visibilityState !== 'hidden'

  constructor(
    private fetchProjection: (
      signal: AbortSignal
    ) => Promise<CapabilityProjection>,
    private clock: () => number = () => performance.now()
  ) {}

  getSnapshot = () =>
    this.snapshot.capabilities.status === 'ready' &&
    !(this.clock() < this.validUntil)
      ? this.expiredSnapshot
      : this.snapshot
  getServerSnapshot = () => INITIAL
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(
    capabilities: CapabilityState,
    sessionRef = this.snapshot.sessionRef,
    force = false
  ) {
    const previous = this.snapshot
    if (
      !force &&
      previous.scopeKey === this.scope.key &&
      previous.sessionRef === sessionRef &&
      previous.capabilities.status === capabilities.status &&
      (previous.capabilities.status !== 'ready' ||
        capabilities.status !== 'ready' ||
        previous.capabilities.grants.join('\n') ===
          capabilities.grants.join('\n'))
    )
      return
    this.snapshot = { scopeKey: this.scope.key, capabilities, sessionRef }
    this.expiredSnapshot = {
      scopeKey: this.scope.key,
      capabilities: { status: 'unknown' },
      sessionRef,
    }
    this.listeners.forEach((listener) => listener())
  }
  private later(callback: () => void, milliseconds: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      callback()
    }, milliseconds)
    this.timers.add(timer)
    return timer
  }
  private cancelTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer !== null) {
      clearTimeout(timer)
      this.timers.delete(timer)
    }
  }
  private invalidate(status: 'unknown' | 'error' = 'unknown') {
    this.generation++
    this.validUntil = 0
    this.request?.abort()
    this.request = null
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    this.expiry = null
    this.publish({ status })
  }
  private eligible() {
    return this.consumers > 0 && this.scope.active && this.visible()
  }
  setScope(scope: ProjectionScope) {
    if (scope.key === this.scope.key) return
    this.invalidate()
    this.scope = scope
    this.publish({ status: 'unknown' }, null)
    if (this.eligible()) this.query()
  }
  private foreground = () => {
    this.invalidate()
    if (this.eligible()) this.query()
  }
  acquire = () => {
    this.consumers++
    if (this.consumers === 1 && typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.foreground)
      window.addEventListener('focus', this.foreground)
      if (this.eligible()) this.query()
    }
    let released = false
    return () => {
      if (released) return
      released = true
      if (--this.consumers === 0) {
        this.invalidate()
        if (typeof window !== 'undefined') {
          document.removeEventListener('visibilitychange', this.foreground)
          window.removeEventListener('focus', this.foreground)
        }
      }
    }
  }
  private query() {
    if (!this.eligible()) return
    const generation = ++this.generation
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    const started = this.clock()
    const scope = this.scope
    if (this.snapshot.capabilities.status !== 'ready')
      this.publish({ status: 'loading' })
    const fail = () => {
      if (generation !== this.generation) return
      this.invalidate('error')
      if (this.eligible()) this.later(() => this.query(), 5000)
    }
    const timeout = this.later(fail, 8000)
    // Promise.resolve also routes a synchronous transport failure through fail.
    Promise.resolve()
      .then(() => {
        if (request.signal.aborted) return null
        return this.fetchProjection(request.signal)
      })
      .then((value) => {
        if (
          generation !== this.generation ||
          request.signal.aborted ||
          value === null
        )
          return
        const result = validateCapabilityProjection(value)
        if (result.account_id !== scope.accountId)
          throw new Error('能力快照身份不匹配')
        this.cancelTimer(timeout)
        this.request = null
        const remaining = started + result.max_age_seconds * 1000 - this.clock()
        this.cancelTimer(this.expiry)
        if (remaining <= 0) {
          this.publish({ status: 'unknown' }, result.session_ref)
          this.later(() => this.query(), 5000)
          return
        }
        const wasExpired =
          this.snapshot.capabilities.status === 'ready' &&
          !(this.clock() < this.validUntil)
        this.validUntil = started + result.max_age_seconds * 1000
        this.publish(
          { status: 'ready', grants: Object.freeze([...result.capabilities]) },
          result.session_ref,
          wasExpired
        )
        this.expiry = this.later(
          () => this.publish({ status: 'unknown' }),
          remaining
        )
        this.later(() => this.query(), Math.max(1, remaining * 0.8))
      })
      .catch(fail)
  }
}
