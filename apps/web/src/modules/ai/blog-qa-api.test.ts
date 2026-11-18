import { getSessionPort } from '@/shared/api/sessionPort'
import {
  fetchBlogQaCapabilities,
  fetchBlogQaRun,
  cancelBlogQaRun,
  deleteBlogQaHistory,
  blogQaMode,
  normalizeBlogQaRun,
  streamBlogQa,
} from './blog-qa-api'
import formalContract from './fixtures/formal-contract.json'
vi.mock('@/shared/api/sessionPort')
vi.mock('@/shared/config', () => ({
  API_BASE_URL: '/api',
  SITE_URL: 'https://sunworld.site',
}))
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
  const value = {
    enabled: true,
    mode: 'site',
    authenticated: true,
    local_validation: false,
    dataset: 'public',
    model: 'test',
    reason: null,
  }
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
  expect(await fetchBlogQaRun('r1')).toMatchObject(value)
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
it('keeps canonical formal citations and normalizes GET at the same boundary', async () => {
  const value = {
    id: 'formal-1',
    status: 'completed',
    question: '公开问题',
    sources: [
      { article_id: 1, title: '公开文章', url: 'https://sunworld.site/blog/1' },
      {
        article_id: 2,
        title: '外部链接',
        url: 'https://outside.invalid/blog/2',
      },
    ],
  }
  expect(normalizeBlogQaRun(value).sources).toEqual([
    { article_id: 1, title: '公开文章', url: '/blog/1' },
  ])
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 1, data: value })))
  )
  expect((await fetchBlogQaRun('formal-1')).sources).toEqual(
    normalizeBlogQaRun(value).sources
  )
})
it.each(formalContract.cases)(
  'consumes the actual formal $case HTTP and SSE contract consistently',
  async (record) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(record.capabilities.body))
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(record.get.body)))
      .mockResolvedValueOnce(new Response(JSON.stringify(record.cancel.body)))
      .mockResolvedValueOnce(
        new Response(
          record.events
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join('')
        )
      )
    vi.stubGlobal('fetch', fetch)
    expect(blogQaMode(await fetchBlogQaCapabilities())).toBe('formal')
    const expected = normalizeBlogQaRun(record.get.body.data)
    expect(await fetchBlogQaRun(expected.id)).toEqual(expected)
    expect(await cancelBlogQaRun(expected.id)).toEqual(
      normalizeBlogQaRun(record.cancel.body.data)
    )
    const received: unknown[] = []
    await streamBlogQa(
      expected.question,
      new AbortController().signal,
      (event) => received.push(event.data)
    )
    expect(normalizeBlogQaRun(received.at(-1))).toEqual(expected)
    expect(
      fetch.mock.calls.every(([url]) => !String(url).includes('/local/'))
    ).toBe(true)
    if (record.case === 'completed')
      expect(expected.sources).toEqual([
        { article_id: 1, title: '权限检查', url: '/blog/1' },
      ])
  }
)
it.each([
  { mode: 'unrecognized', local_validation: true },
  { mode: 'formal', local_validation: true },
  { mode: 'fixtures', local_validation: false },
  { local_validation: false },
])('rejects unknown or contradictory capability mode %j', async (fault) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          data: {
            ...formalContract.cases[0].capabilities.body.data,
            ...fault,
            mode: 'mode' in fault ? fault.mode : undefined,
          },
        })
      )
    )
  )
  await expect(fetchBlogQaCapabilities()).rejects.toThrow('不支持')
})
it('allows only exact site/current-origin citations and positive safe matching article IDs', () => {
  const urls = [
    '/blog/1',
    '/aigc/blog-qa?article=1',
    'https://sunworld.site/blog/1',
    `${window.location.origin}/blog/1`,
    '//sunworld.site/blog/1',
    'https://user@sunworld.site/blog/1',
    'https://sunworld.site/blog/1?q=1',
    'https://sunworld.site/blog/1#x',
    'https://sunworld.site/blog/%31',
    'https://sunworld.site/a/../blog/1',
    'https://sunworld.site/blog/2',
    'https://api.sunworld.site/blog/1',
    'https://sunworld.site\\blog/1',
    '/blog/01',
    '/blog/1?x=1',
  ]
  const sources = urls.map((url) => ({ article_id: 1, title: 'source', url }))
  sources.push(
    ...[0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1].map((article_id) => ({
      article_id,
      title: 'bad',
      url: `/blog/${article_id}`,
    }))
  )
  expect(
    normalizeBlogQaRun({ id: 'r1', status: 'completed', sources }).sources.map(
      (source) => source.url
    )
  ).toEqual(['/blog/1', '/aigc/blog-qa?article=1', '/blog/1', '/blog/1'])
})
it('does not expose backend diagnostic text in failures or fetch malformed run IDs', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: 'SECRET_INTERNAL_DIAGNOSTIC' }), {
      status: 503,
    })
  )
  vi.stubGlobal('fetch', fetch)
  await expect(fetchBlogQaRun('r1')).rejects.toThrow('问答服务暂不可用')
  await expect(cancelBlogQaRun('../r1')).rejects.toThrow('格式')
  await expect(deleteBlogQaHistory('../r1')).rejects.toThrow('格式')
  expect(fetch).toHaveBeenCalledOnce()
})
it('deletes only the selected run with a credentialed, empty request', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ code: 1, data: true, msg: '历史已删除' }))
    )
  const { signal } = new AbortController()
  vi.stubGlobal('fetch', fetch)

  await deleteBlogQaHistory('r_1', signal)

  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledWith('/api/ai/v1/blog-qa/runs/r_1', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    signal,
  })
})
it.each([
  { status: 200, body: 'true' },
  { status: 200, body: '{"code":1,"data":false}' },
  { status: 200, body: '{"code":1,"data":"true"}' },
  { status: 200, body: '{"code":0,"data":true}' },
  { status: 200, body: '<html></html>' },
  { status: 409, body: '{"code":"AGENT_HISTORY_NOT_TERMINAL","data":null}' },
  { status: 503, body: '{"code":1,"data":true}' },
])(
  'refuses to confirm deletion on $status with $body',
  async ({ status, body }) => {
    const fetch = vi.fn().mockResolvedValue(new Response(body, { status }))
    vi.stubGlobal('fetch', fetch)

    await expect(deleteBlogQaHistory('r1')).rejects.toThrow(
      '删除未确认，请重试'
    )
    expect(fetch).toHaveBeenCalledOnce()
  }
)
it('does not retry deletion after the original session changes during refresh', async () => {
  const abort = new AbortController()
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
  session.refresh.mockImplementationOnce(() => abort.abort())
  vi.stubGlobal('fetch', fetch)

  await expect(deleteBlogQaHistory('r1', abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  })
  expect(session.refresh).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledOnce()
})
it.each([{ model: {} }, { dataset: [] }, { reason: {} }])(
  'rejects malformed capability display fields %j',
  async (fault) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 1,
            data: {
              ...formalContract.cases[0].capabilities.body.data,
              ...fault,
            },
          })
        )
      )
    )
    await expect(fetchBlogQaCapabilities()).rejects.toThrow('不支持')
  }
)
