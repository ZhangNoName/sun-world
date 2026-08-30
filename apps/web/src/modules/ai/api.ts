import {
  API_ROUTES,
  type AiStreamEvent,
  type ApiRequestBody,
  type ApiSuccessData,
  type components,
} from '@sun-world/contracts'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/shared/api'
import { API_BASE_URL } from '@/shared/config'

import { readAiSseStream } from './sse'

const workspaceRequest = { suppressErrorToast: true }
const AI_PERSONAS_PATH = '/ai/v1/personas' as const
const AI_PERSONA_PATH = '/ai/v1/personas/{persona_id}' as const
const AI_SKILLS_PATH = '/ai/v1/skills' as const
const AI_SKILL_PATH = '/ai/v1/skills/{skill_id}' as const

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
export type AiPersona = components['schemas']['AiPersona']
export type AiPersonaPayload = components['schemas']['AiPersonaInput']
export type AiSkill = components['schemas']['AiSkill']
export type AiSkillPayload = components['schemas']['AiSkillInput']

export type AiMcpConnection = components['schemas']['AiMcpConnection']
export type AiMcpConnectionCreate =
  components['schemas']['AiMcpConnectionCreate']
export type AiMcpConnectionUpdate =
  components['schemas']['AiMcpConnectionUpdate']
export type AiMcpTool = components['schemas']['AiMcpTool']
export type AiMcpToolCallResult = components['schemas']['AiMcpToolCallResult']

export function fetchAiProviders() {
  return apiGet(API_ROUTES.ai.providers, { config: workspaceRequest })
}

export function fetchAiProviderProfiles() {
  return apiGet(API_ROUTES.ai.providerProfiles, { config: workspaceRequest })
}

export function fetchAiPersonas() {
  return apiGet(AI_PERSONAS_PATH, { config: workspaceRequest })
}

export function createAiPersona(payload: AiPersonaPayload) {
  return apiPost(AI_PERSONAS_PATH, payload, { config: workspaceRequest })
}

export function updateAiPersona(personaId: string, payload: AiPersonaPayload) {
  return apiPut(AI_PERSONA_PATH, payload, {
    path: { persona_id: personaId },
    config: workspaceRequest,
  })
}

export function deleteAiPersona(personaId: string) {
  return apiDelete(AI_PERSONA_PATH, {
    path: { persona_id: personaId },
    config: workspaceRequest,
  })
}

export function fetchAiSkills() {
  return apiGet(AI_SKILLS_PATH, { config: workspaceRequest })
}

export function createAiSkill(payload: AiSkillPayload) {
  return apiPost(AI_SKILLS_PATH, payload, { config: workspaceRequest })
}

export function updateAiSkill(skillId: string, payload: AiSkillPayload) {
  return apiPut(AI_SKILL_PATH, payload, {
    path: { skill_id: skillId },
    config: workspaceRequest,
  })
}

export function deleteAiSkill(skillId: string) {
  return apiDelete(AI_SKILL_PATH, {
    path: { skill_id: skillId },
    config: workspaceRequest,
  })
}

export function fetchAiMcpConnections() {
  return apiGet(API_ROUTES.ai.mcpConnections, { config: workspaceRequest })
}

export function createAiMcpConnection(payload: AiMcpConnectionCreate) {
  return apiPost(API_ROUTES.ai.mcpConnections, payload, {
    config: workspaceRequest,
  })
}

export function updateAiMcpConnection(
  connectionId: string,
  payload: AiMcpConnectionUpdate
) {
  return apiPut(API_ROUTES.ai.mcpConnection, payload, {
    path: { connection_id: connectionId },
    config: workspaceRequest,
  })
}

export function deleteAiMcpConnection(connectionId: string) {
  return apiDelete(API_ROUTES.ai.mcpConnection, {
    path: { connection_id: connectionId },
    config: workspaceRequest,
  })
}

export function discoverAiMcpConnection(connectionId: string) {
  return apiPost(API_ROUTES.ai.mcpDiscover, undefined, {
    path: { connection_id: connectionId },
    config: workspaceRequest,
  })
}

export function fetchAiMcpTools(connectionId: string) {
  return apiGet(API_ROUTES.ai.mcpTools, {
    path: { connection_id: connectionId },
    config: workspaceRequest,
  })
}

export function callAiMcpTool(
  connectionId: string,
  toolName: string,
  argumentsValue: Record<string, unknown>
) {
  return apiPost(
    API_ROUTES.ai.mcpToolCall,
    { arguments: argumentsValue, confirmed: true },
    {
      path: { connection_id: connectionId, tool_name: toolName },
      config: workspaceRequest,
    }
  )
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
