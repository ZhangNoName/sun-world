import { parseAiSseChunks } from './sse'

const event = (overrides: Record<string, unknown> = {}) => ({
  version: '1',
  event_id: 'evt-1',
  type: 'content.delta',
  conversation_id: 'conv-1',
  message_id: 'msg-1',
  sequence: 0,
  created_at: '2026-07-26T12:00:00Z',
  data: { delta: 'hello' },
  ...overrides,
})

describe('parseAiSseChunks', () => {
  it('joins split frames, ignores duplicate event IDs and accepts CRLF', () => {
    const events: unknown[] = []
    const parser = parseAiSseChunks({ onEvent: (value) => events.push(value) })
    const payload = JSON.stringify(event())
    parser.push(`event: message\r\ndata: ${payload.slice(0, 35)}`)
    parser.push(`${payload.slice(35)}\r\n\r\ndata: ${payload}\r\n\r\n`)
    parser.finish()

    expect(events).toEqual([event()])
  })

  it('reports unsupported versions and sequence gaps', () => {
    const errors: Error[] = []
    const parser = parseAiSseChunks({
      onEvent: vi.fn(),
      onProtocolError: (error) => errors.push(error),
    })
    parser.push(`data: ${JSON.stringify(event({ version: '2' }))}\n\n`)
    parser.push(
      `data: ${JSON.stringify(event({ event_id: 'evt-2', sequence: 3 }))}\n\n`
    )
    parser.finish()

    expect(errors.map((error) => error.message)).toEqual([
      '不支持的 AI 协议版本',
      'AI 流事件顺序不完整',
    ])
  })
})
