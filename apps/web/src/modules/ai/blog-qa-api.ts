import { API_BASE_URL } from '@/shared/config'
import { getSessionPort } from '@/shared/api/sessionPort'
import { API_ROUTES, type AiStreamEvent } from '@sun-world/contracts'
import { readAiSseStream } from './sse'

export interface BlogQaCapabilities {
  mode?: 'site' | 'fixtures'
  enabled: boolean
  local_validation: boolean
  authenticated: boolean
  dataset: string
  model: string
  reason?: string
}
export interface BlogQaRun {
  id: string
  status:
    | 'accepted'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
  question: string
  answer?: string
  sources: { article_id: number; title: string; url: string }[]
  error_code?: string
}
export interface LocalArticle {
  id: number
  title: string
  content: string
}
export interface LocalUser {
  user_id: number
  display_name: string
}

export function normalizeBlogQaRun(value: unknown): BlogQaRun {
  if (!value || typeof value !== 'object') throw new Error('问答状态格式不完整')
  const row = value as Partial<BlogQaRun>
  if (
    typeof row.id !== 'string' ||
    ![
      'accepted',
      'running',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ].includes(row.status || '')
  )
    throw new Error('问答状态格式不完整')
  return {
    id: row.id,
    status: row.status as BlogQaRun['status'],
    question: typeof row.question === 'string' ? row.question : '',
    answer: typeof row.answer === 'string' ? row.answer : undefined,
    sources: Array.isArray(row.sources)
      ? row.sources.filter(
          (source) =>
            source &&
            typeof source.title === 'string' &&
            typeof source.article_id === 'number' &&
            /^\/(?:blog\/[1-9]\d*|aigc\/blog-qa\?article=[1-9]\d*)$/.test(
              source.url
            )
        )
      : [],
    error_code: typeof row.error_code === 'string' ? row.error_code : undefined,
  }
}

async function fetchWithSession(path: string, init: RequestInit = {}) {
  const session = getSessionPort()
  if (session.snapshot().hasUser) await session.preflight()
  const send = () =>
    fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    })
  let response = await send()
  if (
    response.status === 401 &&
    session.snapshot().hasUser &&
    !init.signal?.aborted
  ) {
    await session.refresh()
    response = await send()
  }
  return response
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithSession(path, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok || (payload && 'code' in payload && payload.code !== 1)) {
    throw new Error(
      payload?.msg ||
        (response.status === 401
          ? '请先登录'
          : `请求未完成（${response.status}），请重试`)
    )
  }
  return payload && 'code' in payload ? (payload.data as T) : (payload as T)
}
export const fetchBlogQaCapabilities = () =>
  request<BlogQaCapabilities>(API_ROUTES.ai.blogQaCapabilities)
export const fetchLocalUser = () => request<LocalUser>('/local/session')
export const loginLocalUser = () =>
  request<LocalUser>('/local/session', {
    method: 'POST',
    body: JSON.stringify({ user_id: 1 }),
  })
export const logoutLocalUser = () =>
  request('/local/session', { method: 'DELETE' })
export const fetchLocalArticle = (id: number) =>
  request<LocalArticle>(`/local/articles/${id}`)
export const fetchBlogQaRun = (id: string) =>
  request<BlogQaRun>(
    API_ROUTES.ai.blogQaRun.replace('{run_id}', encodeURIComponent(id))
  )
export const cancelBlogQaRun = (id: string) =>
  request<BlogQaRun>(
    API_ROUTES.ai.blogQaCancel.replace('{run_id}', encodeURIComponent(id)),
    {
      method: 'POST',
    }
  )
export async function streamBlogQa(
  question: string,
  signal: AbortSignal,
  onEvent: (event: AiStreamEvent) => void
) {
  const response = await fetchWithSession(API_ROUTES.ai.blogQaRunStream, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, idempotency_key: crypto.randomUUID() }),
  })
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 429
        ? '已有问答正在运行，请稍后再试'
        : `问答未能开始（${response.status}）`
    )
  await readAiSseStream(
    response.body,
    {
      onEvent,
      onProtocolError: (error) => {
        throw error
      },
    },
    signal
  )
}
