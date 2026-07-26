import {
  API_ROUTES,
  type AiStreamEvent,
  type ApiRequestBody,
  type ApiSuccessData,
} from '@sun-world/contracts'
import { apiGet, apiPatch, apiPost, apiPut } from '@/shared/api'
import { API_BASE_URL } from '@/shared/config'

import { readAiSseStream } from './sse'

const workspaceRequest = { suppressErrorToast: true }

export type AiProvidersResponse = ApiSuccessData<
  typeof API_ROUTES.ai.providers,
  'get'
>
export type AiConversationsResponse = ApiSuccessData<
  typeof API_ROUTES.ai.conversations,
  'get'
>
export type AiConversationResponse = ApiSuccessData<
  typeof API_ROUTES.ai.conversation,
  'get'
>
export type AiProviderProfilesResponse = ApiSuccessData<
  typeof API_ROUTES.ai.providerProfiles,
  'get'
>
export type AiRunPayload = ApiRequestBody<
  typeof API_ROUTES.ai.runStream,
  'post'
>
export type AiProviderProfilePayload = ApiRequestBody<
  typeof API_ROUTES.ai.providerProfiles,
  'post'
>

export function fetchAiProviders() {
  return apiGet(API_ROUTES.ai.providers, { config: workspaceRequest })
}

export function fetchAiProviderProfiles() {
  return apiGet(API_ROUTES.ai.providerProfiles, { config: workspaceRequest })
}

export function saveAiProviderProfile(payload: AiProviderProfilePayload) {
  return apiPost(API_ROUTES.ai.providerProfiles, payload, {
    config: workspaceRequest,
  })
}

export function fetchAiConversations() {
  return apiGet(API_ROUTES.ai.conversations, { config: workspaceRequest })
}

export function fetchAiConversation(conversationId: string) {
  return apiGet(API_ROUTES.ai.conversation, {
    path: { conversation_id: conversationId },
    config: workspaceRequest,
  })
}

export function updateAiMessage(messageId: string, content: string) {
  return apiPatch(
    API_ROUTES.ai.message,
    { content },
    { path: { message_id: messageId }, config: workspaceRequest }
  )
}

export function updateAiFeedback(
  messageId: string,
  value: 'like' | 'dislike' | 'none'
) {
  return apiPut(
    API_ROUTES.ai.messageFeedback,
    { value },
    { path: { message_id: messageId }, config: workspaceRequest }
  )
}

export async function streamAiRun(
  payload: AiRunPayload,
  options: {
    onEvent: (event: AiStreamEvent) => void
    onProtocolError?: (error: Error) => void
    signal?: AbortSignal
  }
) {
  const response = await fetch(buildAiUrl(API_ROUTES.ai.runStream), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
    signal: options.signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      msg?: string
      detail?: { message?: string } | string
    } | null
    const detail =
      typeof body?.detail === 'string'
        ? body.detail
        : body?.detail?.message || body?.msg
    throw new Error(detail || `AI 请求失败（${response.status}）`)
  }
  if (!response.body) throw new Error('AI 流响应为空')
  await readAiSseStream(response.body, options, options.signal)
}

function buildAiUrl(path: string) {
  const baseUrl = (import.meta.env.VITE_AI_URL || API_BASE_URL).trim()
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path
}
