import { API_ROUTES } from '@sun-world/contracts'
import type { ApiRequestBody } from '@sun-world/contracts'

export type AiChatPayload = ApiRequestBody<typeof API_ROUTES.ai.chat, 'post'>

export interface AiStreamMessage {
  token?: string
  text?: string
  done?: boolean
  error?: string
}

export interface AiStreamOptions {
  onMessage: (content: string) => void
  onComplete: () => void
  onError: (error: Error) => void
}

export type AiRole = 'user' | 'assistant' | 'system'

export interface AiMessage {
  id: string
  role: AiRole
  content: string
  createdAt: string
  status?: 'sending' | 'streaming' | 'done' | 'error'
}

export interface AiConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface AiProviderOption {
  id: string
  name: string
  model: string
  description: string
}
