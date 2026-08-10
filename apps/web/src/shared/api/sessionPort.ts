export type SessionStatus =
  | 'unknown'
  | 'restoring'
  | 'authenticated'
  | 'anonymous'

export interface SessionSnapshot {
  hasUser: boolean
  status: SessionStatus
}

export interface SessionAdapter {
  snapshot(): SessionSnapshot
  preflight(): Promise<void>
  refresh(): Promise<void>
  sync(): void
}

export interface SessionPort extends SessionAdapter {}

export function createSessionPort(adapter: SessionAdapter): SessionPort {
  let refreshPromise: Promise<void> | null = null

  return {
    snapshot: () => adapter.snapshot(),
    preflight: () => adapter.preflight(),
    sync: () => adapter.sync(),
    refresh() {
      if (!refreshPromise) {
        refreshPromise = adapter.refresh().finally(() => {
          refreshPromise = null
        })
      }
      return refreshPromise
    },
  }
}

const anonymousSession = createSessionPort({
  snapshot: () => ({ hasUser: false, status: 'unknown' }),
  preflight: async () => undefined,
  refresh: async () => {
    throw new Error('Session adapter is not installed')
  },
  sync: () => undefined,
})

let installedSessionPort: SessionPort = anonymousSession

export function installSessionPort(port: SessionPort) {
  installedSessionPort = port
}

export function getSessionPort(): SessionPort {
  return installedSessionPort
}
