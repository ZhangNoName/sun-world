import { getSessionPort } from '@/shared/api/sessionPort'
import {
  fetchBlogQaCapabilities,
  fetchBlogQaRun,
  normalizeBlogQaRun,
  streamBlogQa,
} from './blog-qa-api'
vi.mock('@/shared/api/sessionPort')
vi.mock('@/shared/config', () => ({ API_BASE_URL: '/api' }))
const session = {
  snapshot: () => ({ hasUser: true, status: 'authenticated' as const }),
  preflight: vi.fn(),
  refresh: vi.fn(),
  sync: vi.fn(),
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionPort).mockReturnValue(session)
})
afterEach(() => vi.unstubAllGlobals())
it('unwraps the normal site response envelope', async () => {
  const value = { enabled: true, mode: 'site', authenticated: true }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 1, data: value })))
  )
  expect(await fetchBlogQaCapabilities()).toEqual(value)
})
it('uses the existing session refresh before retrying an unauthorized request', async () => {
  const value = { id: 'r1', status: 'completed', sources: [] }
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 1, data: value }))
    )
  vi.stubGlobal('fetch', fetch)
  expect(await fetchBlogQaRun('r1')).toEqual(value)
  expect(session.refresh).toHaveBeenCalledOnce()
})
it('retains the same idempotency key when retrying a rejected stream start', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(new Response(''))
  vi.stubGlobal('fetch', fetch)
  await streamBlogQa('question', new AbortController().signal, vi.fn())
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
})
it('normalizes session revocation without sources and excludes unsafe links', () => {
  expect(
    normalizeBlogQaRun({
      id: 'r1',
      status: 'cancelled',
      error_code: 'session_revoked',
    })
  ).toMatchObject({ question: '', sources: [] })
  expect(
    normalizeBlogQaRun({
      id: 'r1',
      status: 'completed',
      sources: [{ article_id: 1, title: 'bad', url: 'javascript:alert(1)' }],
    }).sources
  ).toEqual([])
})
