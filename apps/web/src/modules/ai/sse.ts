import {
  AI_PROTOCOL_VERSION,
  isAiStreamEvent,
  type AiStreamEvent,
} from '@sun-world/contracts'

interface AiSseCallbacks {
  onEvent: (event: AiStreamEvent) => void
  onProtocolError?: (error: Error) => void
}

export function parseAiSseChunks(callbacks: AiSseCallbacks) {
  let pending = ''
  let expectedSequence = 0
  const eventIds = new Set<string>()

  const processFrame = (frame: string) => {
    const payload = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!payload || payload === '[DONE]') return

    let candidate: unknown
    try {
      candidate = JSON.parse(payload)
    } catch {
      callbacks.onProtocolError?.(new Error('AI 返回了无法解析的数据'))
      return
    }

    if (
      candidate &&
      typeof candidate === 'object' &&
      'version' in candidate &&
      candidate.version !== AI_PROTOCOL_VERSION
    ) {
      callbacks.onProtocolError?.(new Error('不支持的 AI 协议版本'))
      return
    }
    if (!isAiStreamEvent(candidate)) {
      callbacks.onProtocolError?.(new Error('AI 返回的数据格式不完整'))
      return
    }
    if (eventIds.has(candidate.event_id)) return
    if (candidate.sequence !== expectedSequence) {
      callbacks.onProtocolError?.(new Error('AI 流事件顺序不完整'))
      return
    }

    eventIds.add(candidate.event_id)
    expectedSequence += 1
    callbacks.onEvent(candidate)
  }

  return {
    push(chunk: string) {
      pending += chunk
      const frames = pending.split(/\r?\n\r?\n/)
      pending = frames.pop() ?? ''
      frames.forEach(processFrame)
    },
    finish() {
      if (pending.trim()) processFrame(pending)
      pending = ''
    },
  }
}

export async function readAiSseStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: AiSseCallbacks,
  signal?: AbortSignal
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = parseAiSseChunks(callbacks)
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.finish()
  } finally {
    reader.releaseLock()
  }
}
