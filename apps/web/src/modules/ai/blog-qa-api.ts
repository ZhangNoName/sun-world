import { API_BASE_URL, SITE_URL } from '@/shared/config'
import { getSessionPort } from '@/shared/api/sessionPort'
import { API_ROUTES, type AiStreamEvent } from '@sun-world/contracts'
import { readAiSseStream } from './sse'

export interface BlogQaCapabilities {
  mode?: 'formal' | 'site' | 'fixtures'
  enabled: boolean
  local_validation: boolean
  authenticated: boolean
  dataset: string
  model: string
  reason?: string | null
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

export function blogQaMode(value: BlogQaCapabilities | null) {
  if (
    !value ||
    typeof value.enabled !== 'boolean' ||
    typeof value.authenticated !== 'boolean'
  )
    return null
  if (
    (value.mode === 'formal' || value.mode === 'site') &&
    value.local_validation === false
  )
    return value.mode
  if (
    (value.mode === 'fixtures' || value.mode === undefined) &&
    value.local_validation === true
  )
    return 'fixtures'
  return null
}

const messages: Record<string, string> = {
  AGENT_ACTIVE_SESSION_REQUIRED: '登录已失效，请重新登录后提问',
  active_session_required: '登录后可使用博客问答',
  session_revoked: '登录已失效，请重新登录后提问',
  AGENT_NOT_ALLOWLISTED: '当前账号尚未获得博客问答权限，请联系管理员',
  blog_qa_not_allowlisted: '当前账号尚未获得博客问答权限，请联系管理员',
  blog_qa_admin_required: '当前入口仅向管理员开放，请切换账号',
  AGENT_DISABLED: '当前环境未开放博客问答，请稍后再试',
  site_blog_qa_disabled: '当前环境未开放博客问答，请稍后再试',
  AGENT_LEDGER_FULL: '问答记录容量已满，请联系管理员',
  AGENT_RATE_LIMITED: '已有问答正在运行或请求过于频繁，请稍后再试',
  AGENT_ADMISSION_PENDING: '此问题正在受理，请稍后刷新状态',
  AGENT_MODEL_TIMEOUT: '模型服务暂不可用，请稍后重新提问',
  AGENT_MODEL_FAILED: '模型服务暂不可用，请稍后重新提问',
  AGENT_INPUT_INVALID: '问题格式不正确，请修改后重试',
  AGENT_RUN_NOT_FOUND: '此问答不可读取，请确认当前账号',
  AGENT_HISTORY_DELETED: '此问答历史已删除，请重新提问',
  AGENT_RUN_CANCELLED: '本次问答已取消，可以重新提问',
  AGENT_RUN_INTERRUPTED: '本次问答已中断，请重新提问',
  AGENT_ACCEPT_EXPIRED: '问答等待已超时，请重新提问',
  AGENT_BUDGET_EXCEEDED: '本次问答已达到额度上限，请缩短问题后重新提问',
  AGENT_LEDGER_CAPACITY_INVALID: '问答服务配置暂不可用，请联系管理员',
  stream_interrupted: '连接中断，请刷新运行状态',
}
export function blogQaMessage(reason: unknown): string {
  if (typeof reason === 'string') {
    if (Object.hasOwn(messages, reason)) return messages[reason]
    if (Object.values(messages).includes(reason)) return reason
  }
  return '问答服务暂不可用，请稍后再试'
}

const runIdValid = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
function sourcePath(value: unknown, articleId: number): string | null {
  if (typeof value !== 'string' || /[\x00-\x20\x7f\\]/.test(value)) return null
  const path = `/blog/${articleId}`
  if (value === path || value === `/aigc/blog-qa?article=${articleId}`)
    return value
  if (!/^https?:\/\//.test(value)) return null
  try {
    const url = new URL(value)
    const origins = [new URL(SITE_URL).origin, window.location.origin]
    if (
      !origins.includes(url.origin) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== path ||
      value !== url.origin + path
    )
      return null
    return path
  } catch {
    return null
  }
}

export function normalizeBlogQaRun(value: unknown): BlogQaRun {
  if (!value || typeof value !== 'object') throw new Error('问答状态格式不完整')
  const row = value as Partial<BlogQaRun>
  if (
    !runIdValid(row.id) ||
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
      ? row.sources.flatMap((source) => {
          if (
            !source ||
            typeof source.title !== 'string' ||
            !Number.isSafeInteger(source.article_id) ||
            source.article_id <= 0
          )
            return []
          const url = sourcePath(source.url, source.article_id)
          return url
            ? [{ article_id: source.article_id, title: source.title, url }]
            : []
        })
      : [],
    error_code: typeof row.error_code === 'string' ? row.error_code : undefined,
  }
}

async function fetchWithSession(path: string, init: RequestInit = {}) {
  const session = getSessionPort()
  if (session.snapshot().hasUser) await session.preflight()
  const send = () => {
    init.signal?.throwIfAborted()
    return fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    })
  }
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
      blogQaMessage(
        response.status === 401
          ? 'AGENT_ACTIVE_SESSION_REQUIRED'
          : payload?.code || payload?.detail
      )
    )
  }
  return payload && 'code' in payload ? (payload.data as T) : (payload as T)
}
export async function fetchBlogQaCapabilities(signal?: AbortSignal) {
  const value = await request<BlogQaCapabilities>(
    API_ROUTES.ai.blogQaCapabilities,
    { signal }
  )
  if (
    !value ||
    !blogQaMode(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.authenticated !== 'boolean' ||
    typeof value.dataset !== 'string' ||
    typeof value.model !== 'string' ||
    (value.reason !== undefined &&
      value.reason !== null &&
      typeof value.reason !== 'string')
  )
    throw new Error('问答服务返回了不支持的运行模式')
  return value
}
export const fetchLocalUser = (signal?: AbortSignal) =>
  request<LocalUser>('/local/session', { signal })
export const loginLocalUser = (signal?: AbortSignal) =>
  request<LocalUser>('/local/session', {
    signal,
    method: 'POST',
    body: JSON.stringify({ user_id: 1 }),
  })
export const logoutLocalUser = (signal?: AbortSignal) =>
  request('/local/session', { method: 'DELETE', signal })
export const fetchLocalArticle = (id: number, signal?: AbortSignal) =>
  request<LocalArticle>(`/local/articles/${id}`, { signal })
export const fetchBlogQaRun = async (id: string, signal?: AbortSignal) => {
  if (!runIdValid(id)) throw new Error('问答状态格式不完整')
  return normalizeBlogQaRun(
    await request<unknown>(
      API_ROUTES.ai.blogQaRun.replace('{run_id}', encodeURIComponent(id)),
      { signal }
    )
  )
}
export const cancelBlogQaRun = async (id: string, signal?: AbortSignal) => {
  if (!runIdValid(id)) throw new Error('问答状态格式不完整')
  return normalizeBlogQaRun(
    await request<unknown>(
      API_ROUTES.ai.blogQaCancel.replace('{run_id}', encodeURIComponent(id)),
      {
        method: 'POST',
        signal,
      }
    )
  )
}
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
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null)
    throw new Error(
      blogQaMessage(
        response.status === 401
          ? 'AGENT_ACTIVE_SESSION_REQUIRED'
          : response.status === 429
            ? 'AGENT_RATE_LIMITED'
            : payload?.code || payload?.detail
      )
    )
  }
  await readAiSseStream(
    response.body,
    {
      onEvent: (event) => {
        if (event.type === 'message.completed' || event.type === 'run.failed') {
          const run = normalizeBlogQaRun(event.data)
          onEvent({
            ...event,
            data: {
              ...run,
              answer: run.answer ?? null,
              error_code: run.error_code ?? null,
            },
          })
        } else onEvent(event)
      },
      onProtocolError: (error) => {
        throw error
      },
    },
    signal
  )
}
