export const AI_PROTOCOL_VERSION = '1' as const

export type AiJsonPrimitive = string | number | boolean | null
export type AiJsonValue =
  | AiJsonPrimitive
  | AiJsonValue[]
  | { [key: string]: AiJsonValue }

export interface AiTextBlock {
  type: 'text'
  text: string
  format?: 'plain' | 'markdown'
}

export interface AiTableBlock {
  type: 'table'
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, AiJsonValue>>
  caption?: string
}

export interface AiChartBlock {
  type: 'chart'
  option: Record<string, AiJsonValue>
  summary: string
}

export interface AiLinkBlock {
  type: 'link'
  label: string
  url: string
  description?: string
}

export interface AiRecordBlock {
  type: 'record'
  record_type: string
  record_id: string
  title: string
  metadata?: Record<string, AiJsonValue>
}

export interface AiCustomBlock {
  type: 'custom'
  name: string
  payload: AiJsonValue
}

export type AiContentBlock =
  | AiTextBlock
  | AiTableBlock
  | AiChartBlock
  | AiLinkBlock
  | AiRecordBlock
  | AiCustomBlock

export type AiStreamEventType =
  | 'run.started'
  | 'content.delta'
  | 'component.upsert'
  | 'message.completed'
  | 'run.failed'

export interface AiStreamEvent {
  version: typeof AI_PROTOCOL_VERSION
  event_id: string
  type: AiStreamEventType
  conversation_id: string
  message_id: string
  sequence: number
  created_at: string
  data: Record<string, AiJsonValue>
}

const EVENT_TYPES = new Set<AiStreamEventType>([
  'run.started',
  'content.delta',
  'component.upsert',
  'message.completed',
  'run.failed',
])

export function isAiStreamEvent(value: unknown): value is AiStreamEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    event.version === AI_PROTOCOL_VERSION &&
    typeof event.event_id === 'string' &&
    event.event_id.length > 0 &&
    typeof event.type === 'string' &&
    EVENT_TYPES.has(event.type as AiStreamEventType) &&
    typeof event.conversation_id === 'string' &&
    event.conversation_id.length > 0 &&
    typeof event.message_id === 'string' &&
    event.message_id.length > 0 &&
    Number.isInteger(event.sequence) &&
    (event.sequence as number) >= 0 &&
    typeof event.created_at === 'string' &&
    Boolean(event.data) &&
    typeof event.data === 'object' &&
    !Array.isArray(event.data)
  )
}
