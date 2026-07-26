import { describe, expect, it } from 'vitest'

import {
  AI_PROTOCOL_VERSION,
  API_ROUTES,
  isAiStreamEvent,
  type AiContentBlock,
} from './index'

describe('AI protocol', () => {
  it('accepts every supported structured block shape', () => {
    const blocks: AiContentBlock[] = [
      { type: 'text', text: 'Hello', format: 'markdown' },
      {
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        rows: [{ name: 'Sun World' }],
      },
      {
        type: 'chart',
        option: { xAxis: { type: 'category' }, series: [] },
        summary: 'Empty chart',
      },
      { type: 'link', label: 'Sun World', url: 'https://sunworld.site' },
      {
        type: 'record',
        record_type: 'report',
        record_id: 'record-1',
        title: 'Weekly report',
      },
      { type: 'custom', name: 'sun-world.metric', payload: { value: 42 } },
    ]

    expect(blocks.map((block) => block.type)).toEqual([
      'text',
      'table',
      'chart',
      'link',
      'record',
      'custom',
    ])
  })

  it('validates versioned stream events and rejects unsupported versions', () => {
    const event = {
      version: '1',
      event_id: 'evt-1',
      type: 'content.delta',
      conversation_id: 'conv-1',
      message_id: 'msg-1',
      sequence: 2,
      created_at: '2026-07-26T12:00:00Z',
      data: { delta: 'hello' },
    }

    expect(AI_PROTOCOL_VERSION).toBe('1')
    expect(isAiStreamEvent(event)).toBe(true)
    expect(isAiStreamEvent({ ...event, version: '2' })).toBe(false)
    expect(isAiStreamEvent({ ...event, sequence: -1 })).toBe(false)
    expect(isAiStreamEvent({ ...event, event_id: '' })).toBe(false)
  })

  it('publishes the v1 workspace routes without replacing legacy chat routes', () => {
    expect(API_ROUTES.ai.chatStream).toBe('/ai/chat_stream')
    expect(API_ROUTES.ai.runStream).toBe('/ai/v1/runs/stream')
    expect(API_ROUTES.ai.conversations).toBe('/ai/v1/conversations')
    expect(API_ROUTES.ai.providerProfiles).toBe('/ai/v1/provider-profiles')
  })
})
