import { act, renderHook } from '@testing-library/react'
import type { AiJsonValue } from '@sun-world/contracts'

import {
  fetchAiConversations,
  fetchAiProviderProfiles,
  fetchAiProviders,
  streamAiRun,
} from '../api'
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
const profiles = vi.mocked(fetchAiProviderProfiles)
const conversations = vi.mocked(fetchAiConversations)

const payload = (markdown: string) => ({
  markdown,
  files: [],
  modelId: 'provider:deepseek',
})

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
    profiles.mockResolvedValue([])
    conversations.mockResolvedValue([])
    stream.mockReset()
  })

  it('does not synthesize a provider before the API returns one', () => {
    const { result } = renderHook(() => useAiChat())

    expect(result.current.providers).toEqual([])
  })

  it('clears the previous user workspace when identity changes', async () => {
    authState.user = { id: 7 }
    conversations.mockResolvedValueOnce([
      {
        id: 'user-7-chat',
        title: 'Private chat',
        created_at: '2026-08-09T00:00:00Z',
        updated_at: '2026-08-09T00:00:00Z',
      },
    ])
    const { result, rerender } = renderHook(() => useAiChat())
    await act(async () => undefined)
    expect(result.current.conversations[0]?.id).toBe('user-7-chat')

    authState.user = { id: 8 }
    conversations.mockResolvedValueOnce([])
    rerender()
    await act(async () => undefined)

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.conversations[0]?.id).not.toBe('user-7-chat')
    expect(result.current.messages).toEqual([])
  })

  it('sends the local conversation id for an anonymous run', async () => {
    stream.mockImplementation(async (_payload, options) => {
      options.onEvent(aiEvent('run.started', 0, {}))
      options.onEvent(
        aiEvent('message.completed', 1, {
          blocks: [{ type: 'text', text: 'answer', format: 'markdown' }],
        })
      )
    })
    const { result } = renderHook(() => useAiChat())
    const localConversationId = result.current.activeConversationId

    await act(() => result.current.sendMessage(payload('hello')))

    expect(stream.mock.calls[0]?.[0].conversation_id).toBe(localConversationId)
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

    await act(() => result.current.sendMessage(payload('   ')))
    expect(stream).not.toHaveBeenCalled()

    await act(() => result.current.sendMessage(payload('介绍太阳系')))
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
      pending = result.current.sendMessage(payload('停止测试'))
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

    await act(() => result.current.sendMessage(payload('question')))
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

    await act(() => result.current.sendMessage(payload('first turn')))
    expect(result.current.activeConversationId).toBe('guest-server')
    expect(result.current.conversations[0]?.id).toBe('guest-server')

    await act(() => result.current.sendMessage(payload('second turn')))
    expect(stream.mock.calls[1]?.[0].conversation_id).toBe('guest-server')
  })

  it('maps a selected saved model profile to provider_profile_id', async () => {
    authState.user = { id: 7 }
    profiles.mockResolvedValue([
      {
        id: 'profile-7',
        provider: 'deepseek',
        name: 'Reasoner',
        base_url: 'https://api.deepseek.com',
        model: 'deepseek-reasoner',
        is_default: true,
        has_api_key: true,
        api_key_hint: null,
        created_at: '2026-07-31T00:00:00Z',
        updated_at: '2026-07-31T00:00:00Z',
      },
    ])
    stream.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAiChat())
    await act(async () => undefined)

    await act(() =>
      result.current.sendMessage({
        markdown: 'profile question',
        files: [],
        modelId: 'profile:profile-7',
      })
    )
    expect(stream.mock.calls[0]?.[0].provider_profile_id).toBe('profile-7')
  })

  it('rejects unsupported files and commands before starting a stream', async () => {
    const { result } = renderHook(() => useAiChat())
    const attachment = new File(['content'], 'notes.md')

    await act(async () => {
      await expect(
        result.current.sendMessage({
          markdown: 'read',
          files: [attachment],
          modelId: 'provider:deepseek',
        })
      ).rejects.toThrow('当前服务暂不支持附件')
      await expect(
        result.current.sendMessage({
          markdown: 'run command',
          files: [],
          modelId: 'provider:deepseek',
          commandId: 'summarize',
        })
      ).rejects.toThrow('当前服务暂不支持命令')
    })
    expect(stream).not.toHaveBeenCalled()
  })
})
