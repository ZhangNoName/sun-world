import { act, renderHook, waitFor } from '@testing-library/react'
import { useBlogQa } from './useBlogQa'
import * as api from '../blog-qa-api'
vi.mock('../blog-qa-api')
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
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(api.fetchBlogQaCapabilities).mockResolvedValue(value)
  vi.mocked(api.fetchLocalUser).mockResolvedValue(user)
  vi.mocked(api.logoutLocalUser).mockResolvedValue({})
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
