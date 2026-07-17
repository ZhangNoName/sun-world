import type { AiStreamMessage } from './types'

interface Callbacks {
  onMessage: (content: string) => void
  onComplete: () => void
}
export function parseSseChunks(callbacks: Callbacks) {
  let pending = ''
  let completed = false
  const line = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') {
      completed = true
      callbacks.onComplete()
      return
    }
    try {
      const data = JSON.parse(payload) as AiStreamMessage
      if (data.error) throw new Error(data.error)
      if (data.done) {
        completed = true
        callbacks.onComplete()
      } else if (data.token || data.text)
        callbacks.onMessage(data.token ?? data.text ?? '')
    } catch (error) {
      if (payload.startsWith('{')) throw error
    }
  }
  return {
    push(chunk: string) {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      lines.forEach(line)
    },
    finish() {
      if (pending.trim()) line(pending)
      return completed
    },
  }
}

export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: Callbacks,
  signal?: AbortSignal
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = parseSseChunks(callbacks)
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    if (!parser.finish()) callbacks.onComplete()
  } finally {
    reader.releaseLock()
  }
}
