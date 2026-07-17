import { parseSseChunks } from './sse'

describe('parseSseChunks', () => {
  it('joins split JSON lines and ignores malformed non-data lines', () => {
    const messages: string[] = []
    const parser = parseSseChunks({
      onMessage: (value) => messages.push(value),
      onComplete: vi.fn(),
    })
    parser.push('event: ping\ndata: {"tok')
    parser.push('en":"hel"}\ndata: {"text":"lo"}\n')
    parser.finish()
    expect(messages).toEqual(['hel', 'lo'])
  })
})
