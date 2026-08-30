import { act, renderHook } from '@testing-library/react'
import type { AiJsonValue } from '@sun-world/contracts'

import {
  createAiPersona,
  createAiSkill,
  deleteAiPersona,
  deleteAiSkill,
  fetchAiConversations,
  fetchAiPersonas,
  fetchAiProviderProfiles,
  fetchAiProviders,
  fetchAiSkills,
  streamAiRun,
  updateAiPersona,
  updateAiSkill,
} from '../api'
import { useAiChat } from './useAiChat'

vi.mock('../api', () => ({
  fetchAiConversations: vi.fn().mockResolvedValue([]),
  fetchAiPersonas: vi.fn().mockResolvedValue([]),
  fetchAiProviderProfiles: vi.fn().mockResolvedValue([]),
  fetchAiProviders: vi.fn().mockResolvedValue([]),
  fetchAiSkills: vi.fn().mockResolvedValue([]),
  createAiPersona: vi.fn(),
  updateAiPersona: vi.fn(),
  deleteAiPersona: vi.fn().mockResolvedValue(undefined),
  createAiSkill: vi.fn(),
  updateAiSkill: vi.fn(),
  deleteAiSkill: vi.fn().mockResolvedValue(undefined),
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
const personas = vi.mocked(fetchAiPersonas)
const skills = vi.mocked(fetchAiSkills)
const createPersona = vi.mocked(createAiPersona)
const updatePersona = vi.mocked(updateAiPersona)
const deletePersona = vi.mocked(deleteAiPersona)
const createSkill = vi.mocked(createAiSkill)
const updateSkill = vi.mocked(updateAiSkill)
const deleteSkill = vi.mocked(deleteAiSkill)

const payload = (markdown: string) => ({
  markdown,
  files: [],
  modelId: 'model:deepseek',
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
    personas.mockResolvedValue([])
    skills.mockResolvedValue([])
    createPersona.mockReset()
    updatePersona.mockReset()
    deletePersona.mockReset().mockResolvedValue(null)
    createSkill.mockReset()
    updateSkill.mockReset()
    deleteSkill.mockReset().mockResolvedValue(null)
    stream.mockReset()
  })

  it('does not synthesize a provider before the API returns one', async () => {
    const { result } = renderHook(() => useAiChat())

    await act(async () => undefined)

    expect(result.current.providers).toEqual([])
  })

  it('keeps a blank local conversation active while appending authenticated history', async () => {
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
    const user7LocalId = result.current.activeConversationId

    expect(user7LocalId).toContain('-local-')
    expect(result.current.conversations.map((item) => item.id)).toEqual([
      user7LocalId,
      'user-7-chat',
    ])
    expect(result.current.messages).toEqual([])

    authState.user = { id: 8 }
    conversations.mockResolvedValueOnce([])
    rerender()
    await act(async () => undefined)

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.activeConversationId).not.toBe(user7LocalId)
    expect(result.current.conversations[0]?.id).toBe(
      result.current.activeConversationId
    )
    expect(result.current.messages).toEqual([])
  })

  it('reuses the active blank local conversation instead of inserting another', async () => {
    const { result } = renderHook(() => useAiChat())
    await act(async () => undefined)
    const existingId = result.current.activeConversationId
    let returnedId: string | undefined

    act(() => {
      returnedId = result.current.startConversation()?.id
    })

    expect(returnedId).toBe(existingId)
    expect(result.current.activeConversationId).toBe(existingId)
    expect(result.current.conversations).toHaveLength(1)
  })

  it('aborts a running stream before starting a new conversation', async () => {
    let signal: AbortSignal | undefined
    stream.mockImplementation(
      async (_payload, options) =>
        new Promise<void>((resolve) => {
          signal = options.signal
          options.signal?.addEventListener('abort', () => resolve())
        })
    )
    const { result } = renderHook(() => useAiChat())
    const previousId = result.current.activeConversationId
    let pending!: Promise<void>

    act(() => {
      pending = result.current.sendMessage(payload('继续生成'))
    })
    act(() => {
      result.current.startConversation()
    })

    expect(signal?.aborted).toBe(true)
    expect(result.current.activeConversationId).not.toBe(previousId)
    expect(result.current.messages).toEqual([])

    await act(async () => pending)
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

  it('sends a public model id independently from personal profiles', async () => {
    providers.mockResolvedValue([
      {
        id: 'legacy-chat',
        name: 'Legacy Chat',
        default_model: 'legacy-chat',
        is_default: false,
      },
      {
        id: 'qwen38-27b',
        name: 'Qwen 38 27B',
        default_model: 'qwen38_27b',
        is_default: true,
      },
    ])
    stream.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAiChat())
    await act(async () => undefined)

    await act(() =>
      result.current.sendMessage({
        markdown: 'public model question',
        files: [],
        modelId: 'model:qwen38-27b',
      })
    )

    expect(result.current.providers[1]?.isDefault).toBe(true)
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      model_id: 'qwen38-27b',
      provider_profile_id: null,
    })
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
    expect(stream.mock.calls[0]?.[0].model_id).toBeNull()
  })

  it('loads authenticated capabilities and sends the selected persona and skills', async () => {
    authState.user = { id: 7 }
    personas.mockResolvedValue([
      {
        id: 'persona-editor',
        name: '编辑教练',
        description: '先给结论',
        instructions: '先给结论，再解释原因。',
      },
    ])
    skills.mockResolvedValue([
      {
        id: 'skill-brief',
        name: '简洁回答',
        description: null,
        instructions: '控制在三点以内。',
        kind: 'prompt',
      },
      {
        id: 'skill-checklist',
        name: '检查清单',
        description: null,
        instructions: '最后给出检查清单。',
        kind: 'prompt',
      },
    ])
    stream.mockImplementation(async (_payload, options) => {
      options.onEvent(aiEvent('run.started', 0, {}))
      options.onEvent(
        aiEvent('message.completed', 1, {
          blocks: [{ type: 'text', text: 'answer', format: 'markdown' }],
        })
      )
    })
    const { result } = renderHook(() => useAiChat())
    await act(async () => undefined)

    act(() => result.current.selectPersona('persona-editor'))
    act(() => result.current.toggleSkill('skill-brief'))
    act(() => result.current.toggleSkill('skill-checklist'))
    await act(() => result.current.sendMessage(payload('使用我的配置')))

    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      persona_id: 'persona-editor',
      skill_ids: ['skill-brief', 'skill-checklist'],
    })
  })

  it('keeps capabilities guest-only and does not load private CRUD for anonymous chat', async () => {
    stream.mockImplementation(async (_payload, options) => {
      options.onEvent(aiEvent('run.started', 0, {}))
      options.onEvent(
        aiEvent('message.completed', 1, {
          blocks: [{ type: 'text', text: 'guest answer', format: 'markdown' }],
        })
      )
    })
    const { result } = renderHook(() => useAiChat())
    await act(async () => undefined)

    expect(result.current.capabilityStatus).toBe('guest')
    expect(personas).not.toHaveBeenCalled()
    expect(skills).not.toHaveBeenCalled()

    await act(() => result.current.sendMessage(payload('游客继续聊天')))
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      persona_id: null,
      skill_ids: [],
    })
  })

  it('creates, updates, and deletes prompt-only persona and skill records', async () => {
    authState.user = { id: 7 }
    createPersona.mockResolvedValue({
      id: 'persona-1',
      name: '研究员',
      description: null,
      instructions: '列出证据。',
    })
    updatePersona.mockResolvedValue({
      id: 'persona-1',
      name: '高级研究员',
      description: null,
      instructions: '列出证据与限制。',
    })
    createSkill.mockResolvedValue({
      id: 'skill-1',
      name: '风险提示',
      description: null,
      instructions: '说明主要风险。',
      kind: 'prompt',
    })
    updateSkill.mockResolvedValue({
      id: 'skill-1',
      name: '风险清单',
      description: null,
      instructions: '用清单说明主要风险。',
      kind: 'prompt',
    })
    const { result } = renderHook(() => useAiChat())
    await act(async () => undefined)

    await act(() =>
      result.current.savePersona({
        name: '研究员',
        description: null,
        instructions: '列出证据。',
      })
    )
    await act(() =>
      result.current.savePersona({
        id: 'persona-1',
        name: '高级研究员',
        description: null,
        instructions: '列出证据与限制。',
      })
    )
    expect(updatePersona).toHaveBeenCalledWith(
      'persona-1',
      expect.objectContaining({ name: '高级研究员' })
    )
    await act(() => result.current.removePersona('persona-1'))
    expect(deletePersona).toHaveBeenCalledWith('persona-1')

    await act(() =>
      result.current.saveSkill({
        name: '风险提示',
        description: null,
        instructions: '说明主要风险。',
        kind: 'prompt',
      })
    )
    await act(() =>
      result.current.saveSkill({
        id: 'skill-1',
        name: '风险清单',
        description: null,
        instructions: '用清单说明主要风险。',
        kind: 'prompt',
      })
    )
    expect(updateSkill).toHaveBeenCalledWith(
      'skill-1',
      expect.objectContaining({ kind: 'prompt', name: '风险清单' })
    )
    await act(() => result.current.removeSkill('skill-1'))
    expect(deleteSkill).toHaveBeenCalledWith('skill-1')
  })

  it('rejects unsupported files and commands before starting a stream', async () => {
    const { result } = renderHook(() => useAiChat())
    const attachment = new File(['content'], 'notes.md')

    await act(async () => {
      await expect(
        result.current.sendMessage({
          markdown: 'read',
          files: [attachment],
          modelId: 'model:deepseek',
        })
      ).rejects.toThrow('当前服务暂不支持附件')
      await expect(
        result.current.sendMessage({
          markdown: 'run command',
          files: [],
          modelId: 'model:deepseek',
          commandId: 'summarize',
        })
      ).rejects.toThrow('当前服务暂不支持命令')
    })
    expect(stream).not.toHaveBeenCalled()
  })
})
