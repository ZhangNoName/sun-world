import type { AiContentBlock, AiJsonValue } from '@sun-world/contracts'
import type { ReactNode } from 'react'

export interface AiUiConversation {
  id: string
  title: string
  updatedAt?: string
}

export interface AiUiMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  blocks: AiContentBlock[]
  status: 'pending' | 'streaming' | 'completed' | 'interrupted' | 'failed'
  feedback?: 'like' | 'dislike' | null
}

export interface AiUiProvider {
  id: string
  name: string
  defaultBaseUrl?: string | null
  defaultModel?: string | null
  isDefault?: boolean
  isEnabled?: boolean
}

export interface AiUiProviderProfile {
  id: string
  provider: string
  name: string
  baseUrl: string
  model: string
  isDefault: boolean
  hasApiKey: boolean
  apiKeyHint?: string | null
}

export interface AiProviderDraft {
  provider: string
  name: string
  baseUrl: string
  model: string
  apiKey?: string
  isDefault: boolean
}

export type AiRunState =
  | { status: 'idle' }
  | { status: 'running'; messageId?: string }
  | { status: 'error'; code?: string; message: string; retryable?: boolean }

export interface AiCustomBlockValue {
  name: string
  payload: AiJsonValue
}

export type AiRendererRegistry = Record<
  string,
  (block: AiCustomBlockValue) => ReactNode
>
