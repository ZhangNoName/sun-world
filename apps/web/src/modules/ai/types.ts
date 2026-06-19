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
