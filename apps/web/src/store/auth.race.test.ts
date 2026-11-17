import { useAuthStore } from './auth'
import {
  getCurrentUser,
  getSessionStatus,
  login,
  logout,
  refreshToken,
} from '@/modules/account/api'

vi.mock('@/modules/account/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  completeVerificationLogin: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionStatus: vi.fn(),
  refreshToken: vi.fn(),
}))
vi.mock('@/util/cookie', () => ({
  getAccessTokenExpire: () => null,
  getRefreshTokenExpire: () => null,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const firstUser = { id: 1, username: 'first-synthetic' } as never
const secondUser = { id: 2, username: 'second-synthetic' } as never
const session = () =>
  ({
    access_token_expire: new Date(Date.now() + 60_000).toISOString(),
    refresh_token_expire: new Date(Date.now() + 600_000).toISOString(),
  }) as never

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.getState().clearTokens()
})

it('does not restore an account after the session was cleared', async () => {
  const pending = deferred<never>()
  vi.mocked(getCurrentUser).mockReturnValue(pending.promise)
  const restore = useAuthStore.getState().restoreSession()
  useAuthStore.getState().clearTokens()
  pending.resolve(firstUser)
  expect(await restore).toBeNull()
  expect(useAuthStore.getState()).toMatchObject({
    status: 'anonymous',
    user: null,
    accessTokenExpire: null,
  })
})

it('does not reuse the previous cached account for a new login', async () => {
  useAuthStore.setState({ status: 'authenticated', user: firstUser })
  vi.mocked(login).mockResolvedValue(session())
  vi.mocked(getCurrentUser).mockResolvedValue(secondUser)
  await useAuthStore.getState().login('second-synthetic', 'synthetic-unused')
  expect(getCurrentUser).toHaveBeenCalledOnce()
  expect(useAuthStore.getState().user).toBe(secondUser)
})

it('lets a new restore run while an invalidated one is pending', async () => {
  const old = deferred<never>()
  vi.mocked(getCurrentUser)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(secondUser)
  const previous = useAuthStore.getState().restoreSession()
  useAuthStore.getState().clearTokens()
  const next = useAuthStore.getState().restoreSession()
  old.reject(new Error('old synthetic failure'))
  expect(await previous).toBeNull()
  expect(await next).toBe(secondUser)
  expect(getCurrentUser).toHaveBeenCalledTimes(2)
  expect(useAuthStore.getState().user).toBe(secondUser)
})

it('keeps the new shared promise when an old restore finishes', async () => {
  const old = deferred<never>()
  const current = deferred<never>()
  vi.mocked(getCurrentUser)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise)
  const previous = useAuthStore.getState().restoreSession()
  useAuthStore.getState().clearTokens()
  const next = useAuthStore.getState().restoreSession()
  old.resolve(firstUser)
  const previousValue = await previous
  const concurrent = useAuthStore.getState().restoreSession()
  current.resolve(secondUser)
  const values = await Promise.all([next, concurrent])
  expect(previousValue).toBeNull()
  expect(values).toEqual([secondUser, secondUser])
  expect(getCurrentUser).toHaveBeenCalledTimes(2)
})

it('does not write a late refresh into a cleared session', async () => {
  const pending = deferred<never>()
  vi.mocked(getSessionStatus).mockReturnValue(pending.promise)
  const refresh = useAuthStore.getState().refreshSession()
  const rejected = expect(refresh).rejects.toThrow()
  useAuthStore.getState().clearTokens()
  pending.resolve(session())
  await rejected
  expect(refreshToken).not.toHaveBeenCalled()
  expect(useAuthStore.getState()).toMatchObject({
    status: 'anonymous',
    user: null,
    accessTokenExpire: null,
  })
})

it('keeps a new login when an older logout response arrives', async () => {
  const pending = deferred<never>()
  vi.mocked(logout).mockReturnValue(pending.promise)
  const previous = useAuthStore.getState().logout()
  vi.mocked(login).mockResolvedValue(session())
  vi.mocked(getCurrentUser).mockResolvedValue(secondUser)
  await useAuthStore.getState().login('second-synthetic', 'synthetic-unused')
  pending.resolve(null as never)
  await previous
  expect(useAuthStore.getState()).toMatchObject({
    status: 'authenticated',
    user: secondUser,
  })
})

it('does not automatically restore cookies while logout is pending', async () => {
  const pending = deferred<never>()
  vi.mocked(logout).mockReturnValue(pending.promise)
  const previous = useAuthStore.getState().logout()
  const restored = await useAuthStore.getState().restoreSession()
  pending.resolve(null as never)
  await previous
  expect(restored).toBeNull()
  expect(getCurrentUser).not.toHaveBeenCalled()
})

it('does not clear a new account after an old refresh fails', async () => {
  const old = deferred<never>()
  vi.mocked(getSessionStatus).mockReturnValue(old.promise)
  const refresh = useAuthStore.getState().refreshSession()
  const failed = expect(refresh).rejects.toThrow('登录状态已变化')
  vi.mocked(login).mockResolvedValue(session())
  vi.mocked(getCurrentUser).mockResolvedValue(secondUser)
  await useAuthStore.getState().login('second-synthetic', 'synthetic-unused')
  old.reject(new Error('old synthetic refresh'))
  await failed
  expect(refreshToken).not.toHaveBeenCalled()
  expect(useAuthStore.getState().user).toBe(secondUser)
  expect(useAuthStore.getState().accessTokenExpire).not.toBeNull()
})

it('shares the current refresh for concurrent callers', async () => {
  const pending = deferred<never>()
  vi.mocked(getSessionStatus).mockReturnValue(pending.promise)
  const first = useAuthStore.getState().refreshSession()
  const second = useAuthStore.getState().refreshSession()
  pending.resolve(session())
  await Promise.all([first, second])
  expect(getSessionStatus).toHaveBeenCalledOnce()
})
