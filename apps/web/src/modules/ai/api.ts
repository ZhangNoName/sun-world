import { API_ROUTES } from '@sun-world/contracts'
import { API_BASE_URL } from '@/shared/config'
import { apiPost } from '@/shared/api'
import type {
  AiChatPayload,
  AiProviderOption,
  AiStreamMessage,
  AiStreamOptions,
} from './types'

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    model: 'deepseek-chat',
    description: 'Server-side OpenAI-compatible provider.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    model: 'openai-compatible',
    description: 'Fallback provider configured on the API server.',
  },
]

export async function sendAiMessage(
  message: string,
  sessionId: string
): Promise<string> {
  const answer = await apiPost(
    API_ROUTES.ai.chat,
    createChatPayload(message, sessionId)
  )
  return normalizeAiAnswer(answer)
}

export async function sendAiStreamMessage(
  message: string,
  sessionId: string,
  options: AiStreamOptions
): Promise<void> {
  await readAiEventStream(
    API_ROUTES.ai.chatStream,
    createChatPayload(message, sessionId),
    options
  )
}

export async function sendAiChunkStreamMessage(
  message: string,
  sessionId: string,
  onMessage: (content: string) => void
): Promise<void> {
  await readAiEventStream(
    API_ROUTES.ai.chatChunkStream,
    createChatPayload(message, sessionId),
    {
      onMessage,
      onComplete: () => undefined,
      onError: (error) => {
        throw error
      },
    }
  )
}

function createChatPayload(message: string, sessionId: string): AiChatPayload {
  return {
    question: message,
    session_id: sessionId,
  }
}

function normalizeAiAnswer(answer: unknown): string {
  if (typeof answer === 'string') {
    return answer
  }

  if (answer && typeof answer === 'object' && 'content' in answer) {
    const content = (answer as { content?: unknown }).content
    return typeof content === 'string' ? content : JSON.stringify(content)
  }

  return JSON.stringify(answer)
}

async function readAiEventStream(
  path: string,
  payload: AiChatPayload,
  options: AiStreamOptions
): Promise<void> {
  try {
    const response = await fetch(buildAiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const completedByStream = await readStreamLines(reader, (line) =>
      handleStreamLine(line, options)
    )
    if (!completedByStream) {
      options.onComplete()
    }
  } catch (error) {
    options.onError(error as Error)
  }
}

async function readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => boolean
): Promise<boolean> {
  const decoder = new TextDecoder()
  let pending = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      if (pending.trim()) {
        return onLine(pending)
      }
      return false
    }

    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''

    for (const line of lines) {
      if (onLine(line)) {
        return true
      }
    }
  }
}

function handleStreamLine(line: string, options: AiStreamOptions): boolean {
  const content = line.trim()
  if (!content) {
    return false
  }

  const payload = content.startsWith('data: ')
    ? content.slice('data: '.length)
    : content

  if (payload === '[DONE]') {
    options.onComplete()
    return true
  }

  const data = JSON.parse(payload) as AiStreamMessage
  if (data.error) {
    throw new Error(data.error)
  }
  if (data.done) {
    options.onComplete()
    return true
  }
  if (data.token) {
    options.onMessage(data.token)
  } else if (data.text) {
    options.onMessage(data.text)
  }
  return false
}

function buildAiUrl(path: string): string {
  const baseUrl = (import.meta.env.VITE_AI_URL || API_BASE_URL).trim()

  if (!baseUrl) {
    return path
  }

  return `${baseUrl.replace(/\/$/, '')}${path}`
}
