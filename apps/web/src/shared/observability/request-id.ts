const REQUEST_ID_HEADER = 'X-Request-ID'
const CORRELATION_ID_HEADER = 'X-Correlation-ID'
const MAX_REQUEST_ID_LENGTH = 128
const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9._:-]+$/

export interface RequestTracingMeta {
  requestId: string
}

export type HeaderRecord = Record<string, unknown>

export function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid

  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `web_${timestamp}_${random}`
}

export function normalizeRequestId(value: unknown): string | undefined {
  const requestId = Array.isArray(value) ? value[0] : value
  if (typeof requestId !== 'string') return undefined

  const trimmed = requestId.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_REQUEST_ID_LENGTH) return undefined
  if (!SAFE_REQUEST_ID_RE.test(trimmed)) return undefined
  return trimmed
}

export function readRequestIdFromHeaders(
  headers: HeaderRecord | undefined
): string | undefined {
  if (!headers) return undefined

  return (
    normalizeRequestId(getHeader(headers, REQUEST_ID_HEADER)) ??
    normalizeRequestId(getHeader(headers, CORRELATION_ID_HEADER))
  )
}

export function getRequestIdHeaderName(): string {
  return REQUEST_ID_HEADER
}

function getHeader(headers: HeaderRecord, name: string): unknown {
  const direct = headers[name]
  if (direct !== undefined) return direct

  const lower = name.toLowerCase()
  const lowerValue = headers[lower]
  if (lowerValue !== undefined) return lowerValue

  const foundKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === lower
  )
  return foundKey ? headers[foundKey] : undefined
}
