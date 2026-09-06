import { parseAiSseChunks, readAiSseStream } from './sse'

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

describe('readAiSseStream', () => {
  it('cancels a stalled read promptly and releases the reader lock', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const controller = new AbortController()
    const onEvent = vi.fn()
    const pending = readAiSseStream(stream, { onEvent }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(onEvent).not.toHaveBeenCalled()
    expect(stream.locked).toBe(false)
  })

  it('does not deliver an already queued frame after cancellation', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(event())}\n\n`)
        )
      },
    })
    const controller = new AbortController()
    const onEvent = vi.fn()
    const pending = readAiSseStream(stream, { onEvent }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(onEvent).not.toHaveBeenCalled()
    expect(stream.locked).toBe(false)
  })

  it('decodes split UTF-8 characters and flushes a final frame without a delimiter', async () => {
    const bytes = new TextEncoder().encode(
      `data: ${JSON.stringify(event({ data: { delta: '你好' } }))}`
    )
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const onEvent = vi.fn()
    await readAiSseStream(stream, { onEvent })
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(event({ data: { delta: '你好' } }))
    expect(stream.locked).toBe(false)
  })
})
