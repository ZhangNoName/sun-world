import { act, renderHook } from '@testing-library/react'
import type { AiJsonValue } from '@sun-world/contracts'

import { fetchAiProviders, streamAiRun } from '../api'
import { useAiChat } from './useAiChat'

vi.mock('../api', () => ({
  fetchAiConversations: vi.fn().mockResolvedValue([]),
  fetchAiProviderProfiles: vi.fn().mockResolvedValue([]),
  fetchAiProviders: vi.fn().mockResolvedValue([]),
  streamAiRun: vi.fn(),
  updateAiFeedback: vi.fn().mockResolvedValue(undefined),
  updateAiMessage: vi.fn(),
  saveAiProviderProfile: vi.fn(),
}))

const authState = vi.hoisted(() => ({ user: null as null | { id: number } }))

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) =>
    selector(authState),
}))

const stream = vi.mocked(streamAiRun)
const providers = vi.mocked(fetchAiProviders)

function aiEvent(
  type: 'run.started' | 'content.delta' | 'message.completed',
  sequence: number,
  data: Record<string, AiJsonValue>
) {
  return {
    version: '1' as const,
    event_id: `evt-${sequence}`,
    type,
    conversation_id: 'guest-server',
    message_id: 'assistant-server',
    sequence,
    created_at: '2026-07-26T12:00:00Z',
    data,
  }
}

describe('useAiChat', () => {
  beforeEach(() => {
    authState.user = null
    providers.mockResolvedValue([])
  })

  it('ignores empty prompts and maps versioned stream events into blocks', async () => {
    stream.mockImplementation(async (_payload, options) => {
      options.onEvent(aiEvent('run.started', 0, {}))
      options.onEvent(aiEvent('content.delta', 1, { delta: '你好' }))
      options.onEvent(
        aiEvent('message.completed', 2, {
          blocks: [{ type: 'text', text: '你好', format: 'markdown' }],
        })
      )
    })
    const { result } = renderHook(() => useAiChat())

    await act(() => result.current.sendMessage('   '))
    expect(stream).not.toHaveBeenCalled()

    await act(() => result.current.sendMessage('介绍太阳系'))
    expect(result.current.messages).toMatchObject([
      { role: 'user', blocks: [{ type: 'text', text: '介绍太阳系' }] },
      {
        role: 'assistant',
        blocks: [{ type: 'text', text: '你好', format: 'markdown' }],
        status: 'completed',
      },
    ])
    expect(result.current.runState).toEqual({ status: 'idle' })
  })

  it('aborts the active versioned stream without showing an error', async () => {
    let signal: AbortSignal | undefined
    stream.mockImplementation(
      async (_payload, options) =>
        new Promise<void>((resolve) => {
          signal = options.signal
          signal?.addEventListener('abort', () => resolve())
        })
    )
    const { result } = renderHook(() => useAiChat())
    let pending: Promise<void>

    act(() => {
      pending = result.current.sendMessage('停止测试')
    })
    await act(async () => result.current.stop())
    expect(signal?.aborted).toBe(true)
    await act(async () => pending)
    expect(result.current.runState).toEqual({ status: 'idle' })
  })

  it('regenerates an answer without duplicating the source user message', async () => {
    stream.mockImplementation(async (_payload, options) => {
      options.onEvent(aiEvent('run.started', 0, {}))
      options.onEvent(
        aiEvent('message.completed', 1, {
          blocks: [{ type: 'text', text: 'answer', format: 'markdown' }],
        })
      )
    })
    const { result } = renderHook(() => useAiChat())

    await act(() => result.current.sendMessage('question'))
    const sourceMessageId = result.current.messages[0]?.id
    await act(() => result.current.regenerate('assistant-server'))

    expect(result.current.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(stream).toHaveBeenCalledTimes(2)
    expect(stream.mock.calls[1]?.[0].parent_message_id).toBe(sourceMessageId)
  })

  it('adopts the persistent conversation id before the next authenticated turn', async () => {
    authState.user = { id: 7 }
    stream.mockImplementation(async (_payload, options) => {
      options.onEvent(aiEvent('run.started', 0, {}))
      options.onEvent(
        aiEvent('message.completed', 1, {
          blocks: [{ type: 'text', text: 'answer', format: 'markdown' }],
        })
      )
    })
    const { result } = renderHook(() => useAiChat())

    await act(() => result.current.sendMessage('first turn'))
    expect(result.current.activeConversationId).toBe('guest-server')
    expect(result.current.conversations[0]?.id).toBe('guest-server')

    await act(() => result.current.sendMessage('second turn'))
    expect(stream.mock.calls[1]?.[0].conversation_id).toBe('guest-server')
  })
})
