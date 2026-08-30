export const DEFAULT_API_BASE_URL = 'https://api.sunworld.site'

export function resolveApiBaseUrl(value) {
  const raw =
    value || process.env.SUN_WORLD_API_BASE_URL || DEFAULT_API_BASE_URL
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('Sun World API base URL is invalid.')
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      'Sun World API base URL must use HTTP or HTTPS without credentials.'
    )
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

export async function getApiJson(path, { baseUrl, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(
    new URL(path, `${resolveApiBaseUrl(baseUrl)}/`),
    {
      headers: { accept: 'application/json' },
    }
  )
  return unwrapApiResponse(await parseJsonResponse(response))
}

export async function streamAiRun(
  payload,
  { baseUrl, fetchImpl = fetch, onEvent = () => {}, signal } = {}
) {
  const response = await fetchImpl(
    new URL('/ai/v1/runs/stream', `${resolveApiBaseUrl(baseUrl)}/`),
    {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    }
  )
  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Sun World API returned HTTP ${response.status}: ${bounded(body)}`
    )
  }
  if (!response.body)
    throw new Error('Sun World API returned an empty event stream.')

  let previousSequence = -1
  let terminalEvent = null
  let text = ''
  for await (const event of decodeSseJson(response.body)) {
    validateAiEvent(event, previousSequence, terminalEvent)
    previousSequence = event.sequence
    if (
      event.type === 'content.delta' &&
      typeof event.data?.delta === 'string'
    ) {
      text += event.data.delta
    }
    if (event.type === 'message.completed' || event.type === 'run.failed') {
      terminalEvent = event
    }
    onEvent(event)
  }

  if (!terminalEvent)
    throw new Error('Sun World AI stream ended without a terminal event.')
  if (terminalEvent.type === 'run.failed') {
    const code = terminalEvent.data?.code || 'AI_RUN_FAILED'
    const message = terminalEvent.data?.message || 'The AI run failed.'
    throw new Error(`${code}: ${message}`)
  }
  return {
    conversationId: terminalEvent.conversation_id,
    messageId: terminalEvent.message_id,
    text,
  }
}

export async function* decodeSseJson(stream) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
    while (true) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary < 0) break
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue
      try {
        yield JSON.parse(data)
      } catch {
        throw new Error('Sun World API returned an invalid SSE JSON frame.')
      }
    }
  }
  buffer += decoder.decode()
  if (buffer.trim())
    throw new Error('Sun World API returned an incomplete SSE frame.')
}

function validateAiEvent(event, previousSequence, terminalEvent) {
  if (!event || typeof event !== 'object' || event.version !== '1') {
    throw new Error('Sun World API returned an unsupported AI event.')
  }
  if (!Number.isInteger(event.sequence) || event.sequence <= previousSequence) {
    throw new Error('Sun World API returned an out-of-order AI event.')
  }
  if (terminalEvent)
    throw new Error('Sun World API returned an event after the terminal event.')
}

async function parseJsonResponse(response) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `Sun World API returned HTTP ${response.status}: ${bounded(text)}`
    )
  }
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Sun World API returned invalid JSON.')
  }
}

function unwrapApiResponse(value) {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'data'))
    return value.data
  return value
}

function bounded(value) {
  return String(value).slice(0, 2_000)
}
