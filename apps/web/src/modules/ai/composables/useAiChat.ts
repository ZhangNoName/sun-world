import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiContentBlock, AiStreamEvent } from '@sun-world/contracts'
import type {
  AiProviderDraft,
  AiRunState,
  AiUiConversation,
  AiUiMessage,
  AiUiProvider,
  AiUiProviderProfile,
} from '@sun-world/ai-ui'
import {
  AiComposerSubmitError,
  type AiComposerSubmitPayload,
} from '@sun-world/ai-composer'
import { useAuthStore } from '@/store/auth'
import { buildAiCommandPrompt } from '../composer-commands'

import {
  createAiPersona,
  createAiSkill,
  deleteAiPersona,
  deleteAiSkill,
  fetchAiConversation,
  fetchAiConversations,
  fetchAiPersonas,
  fetchAiProviderProfiles,
  fetchAiProviders,
  fetchAiSkills,
  saveAiProviderProfile,
  streamAiRun,
  updateAiFeedback,
  updateAiMessage,
  updateAiPersona,
  updateAiSkill,
  type AiPersona,
  type AiPersonaPayload,
  type AiRunPayload,
  type AiSkill,
  type AiSkillPayload,
} from '../api'

export const MAX_SELECTED_AI_SKILLS = 8

export type AiCapabilityStatus = 'guest' | 'loading' | 'ready' | 'error'
export type AiPersonaDraft = AiPersonaPayload & { id?: string }
export type AiSkillDraft = AiSkillPayload & { id?: string }

const GUEST_PROVIDER_ID = 'openai-guest'
const GUEST_MODEL = 'gpt-6.1-sol'
const EMPTY_PROVIDERS: AiUiProvider[] = []
export type AiReasoningEffort = NonNullable<AiRunPayload['reasoning_effort']>

const now = () => new Date().toISOString()
const localId = (prefix: string) =>
  `${prefix}-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function newConversation(): AiUiConversation {
  return { id: localId('chat'), title: '新对话', updatedAt: now() }
}

export function useAiChat() {
  const user = useAuthStore((state) => state.user)
  const initialConversation = useRef(newConversation()).current
  const [conversations, setConversations] = useState<AiUiConversation[]>([
    initialConversation,
  ])
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversation.id
  )
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, AiUiMessage[]>
  >({ [initialConversation.id]: [] })
  const [runState, setRunState] = useState<AiRunState>({ status: 'idle' })
  const [reasoningEffort, setReasoningEffort] =
    useState<AiReasoningEffort>('medium')
  const [providerCatalog, setProviderCatalog] = useState<{
    userId: number | null
    items: AiUiProvider[]
  } | null>(null)
  const [providerProfiles, setProviderProfiles] = useState<
    AiUiProviderProfile[]
  >([])
  const [personas, setPersonas] = useState<AiPersona[]>([])
  const [skills, setSkills] = useState<AiSkill[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(
    null
  )
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [capabilityStatus, setCapabilityStatus] =
    useState<AiCapabilityStatus>('guest')
  const [capabilityError, setCapabilityError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const workspaceGeneration = useRef(0)
  const capabilityGeneration = useRef(0)
  const historyGeneration = useRef(0)
  const pendingEdit = useRef<object | null>(null)
  const userId = user?.id ?? null
  const providers =
    providerCatalog?.userId === userId ? providerCatalog.items : EMPTY_PROVIDERS

  useEffect(() => {
    let cancelled = false
    void fetchAiProviders()
      .then((items) => {
        if (!cancelled && items)
          setProviderCatalog({
            userId,
            items: items
              .filter(
                (item) =>
                  userId !== null ||
                  (item.id === GUEST_PROVIDER_ID &&
                    item.default_model === GUEST_MODEL)
              )
              .map((item) => ({
                id: item.id,
                name: item.name,
                defaultBaseUrl: item.default_base_url,
                defaultModel: item.default_model,
                isDefault: item.is_default === true,
              })),
          })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    const generation = ++workspaceGeneration.current
    ++historyGeneration.current
    pendingEdit.current = null
    controller.current?.abort()
    controller.current = null
    const emptyConversation = newConversation()
    setConversations([emptyConversation])
    setActiveConversationId(emptyConversation.id)
    setMessagesByConversation({ [emptyConversation.id]: [] })
    setProviderProfiles([])
    setRunState({ status: 'idle' })

    if (userId)
      void Promise.all([fetchAiConversations(), fetchAiProviderProfiles()])
        .then(([conversationItems, profileItems]) => {
          if (workspaceGeneration.current !== generation) return
          const mapped = (conversationItems ?? []).map(mapConversation)
          if (mapped.length)
            setConversations((current) => [
              ...current,
              ...mapped.filter(
                (item) => !current.some((existing) => existing.id === item.id)
              ),
            ])
          setProviderProfiles((profileItems ?? []).map(mapProviderProfile))
        })
        .catch(() => undefined)
    return () => {
      if (workspaceGeneration.current === generation) {
        ++workspaceGeneration.current
        ++historyGeneration.current
        pendingEdit.current = null
        controller.current?.abort()
        controller.current = null
      }
    }
  }, [userId])

  const refreshCapabilities = useCallback(async () => {
    if (!userId) return
    const generation = ++capabilityGeneration.current
    setCapabilityStatus('loading')
    setCapabilityError(null)
    try {
      const [personaItems, skillItems] = await Promise.all([
        fetchAiPersonas(),
        fetchAiSkills(),
      ])
      if (capabilityGeneration.current !== generation) return
      const nextPersonas = personaItems ?? []
      const nextSkills = skillItems ?? []
      setPersonas(nextPersonas)
      setSkills(nextSkills)
      setSelectedPersonaId((current) =>
        current && nextPersonas.some((item) => item.id === current)
          ? current
          : null
      )
      setSelectedSkillIds((current) =>
        current.filter((id) => nextSkills.some((item) => item.id === id))
      )
      setCapabilityStatus('ready')
    } catch (error) {
      if (capabilityGeneration.current !== generation) return
      setCapabilityStatus('error')
      setCapabilityError(errorMessage(error))
    }
  }, [userId])

  useEffect(() => {
    ++capabilityGeneration.current
    setPersonas([])
    setSkills([])
    setSelectedPersonaId(null)
    setSelectedSkillIds([])
    setCapabilityError(null)
    if (!userId) {
      setCapabilityStatus('guest')
      return
    }
    void refreshCapabilities()
    return () => {
      ++capabilityGeneration.current
    }
  }, [refreshCapabilities, userId])

  const startConversation = useCallback(() => {
    ++historyGeneration.current
    pendingEdit.current = null
    const currentConversation = conversations.find(
      (conversation) => conversation.id === activeConversationId
    )
    const currentMessages = messagesByConversation[activeConversationId] ?? []
    const isBlankLocalConversation =
      runState.status !== 'running' &&
      currentConversation?.id.includes('-local-') === true &&
      currentConversation.title === '新对话' &&
      currentMessages.length === 0

    if (isBlankLocalConversation) {
      setActiveConversationId(currentConversation.id)
      setRunState({ status: 'idle' })
      return currentConversation
    }

    controller.current?.abort()
    const conversation = newConversation()
    setConversations((items) => [conversation, ...items])
    setMessagesByConversation((items) => ({
      ...items,
      [conversation.id]: [],
    }))
    setActiveConversationId(conversation.id)
    setRunState({ status: 'idle' })
    return conversation
  }, [
    activeConversationId,
    conversations,
    messagesByConversation,
    runState.status,
  ])

  const selectConversation = useCallback(
    (conversationId: string) => {
      pendingEdit.current = null
      const generation = ++historyGeneration.current
      const workspace = workspaceGeneration.current
      controller.current?.abort()
      setActiveConversationId(conversationId)
      setRunState({ status: 'idle' })
      if (!user || conversationId.includes('-local-')) return
      void fetchAiConversation(conversationId)
        .then((conversation) => {
          if (
            !conversation ||
            historyGeneration.current !== generation ||
            workspaceGeneration.current !== workspace
          )
            return
          setMessagesByConversation((current) => {
            const previous = new Map(
              current[conversationId]?.map((message) => [message.id, message])
            )
            return {
              ...current,
              [conversationId]: (conversation.messages ?? []).map((item) => {
                const message = mapMessage(item)
                const existing = previous.get(message.id)
                return existing
                  ? {
                      ...message,
                      renderKey: existing.renderKey,
                      metrics: existing.metrics,
                    }
                  : message
              }),
            }
          })
        })
        .catch((error: unknown) => {
          if (
            historyGeneration.current !== generation ||
            workspaceGeneration.current !== workspace
          )
            return
          setRunState({ status: 'error', message: errorMessage(error) })
        })
    },
    [user]
  )

  const updateMessage = useCallback(
    (
      conversationId: string,
      messageId: string,
      update: (message: AiUiMessage) => AiUiMessage
    ) => {
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? []).map((message) =>
          message.id === messageId ? update(message) : message
        ),
      }))
    },
    []
  )

  const sendTextMessage = useCallback(
    async (
      raw: string,
      options?: {
        reuseUser?: boolean
        parentMessageId?: string
        providerProfileId?: string | null
        modelId?: string | null
      }
    ) => {
      const text = raw.trim()
      if (!text || controller.current || pendingEdit.current) return
      ++historyGeneration.current
      const generation = workspaceGeneration.current
      const conversationId = activeConversationId
      const userMessageId = localId('user')
      const assistantMessageId = localId('assistant')
      const userMessage: AiUiMessage = {
        id: userMessageId,
        conversationId,
        role: 'user',
        blocks: [{ type: 'text', text, format: 'markdown' }],
        status: 'completed',
      }
      const assistantMessage: AiUiMessage = {
        id: assistantMessageId,
        renderKey: assistantMessageId,
        conversationId,
        role: 'assistant',
        blocks: [],
        status: 'streaming',
      }
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] ?? []),
          ...(options?.reuseUser ? [] : [userMessage]),
          assistantMessage,
        ],
      }))
      if (!options?.reuseUser)
        setConversations((items) =>
          items.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  title:
                    item.title === '新对话' ? text.slice(0, 48) : item.title,
                  updatedAt: now(),
                }
              : item
          )
        )
      setRunState({ status: 'running', messageId: assistantMessageId })
      const requestController = new AbortController()
      controller.current = requestController
      let failed = false
      let terminal = false
      let resolvedConversationId = conversationId
      const isCurrentRun = () =>
        workspaceGeneration.current === generation &&
        controller.current === requestController
      const handleAbort = () => {
        if (!isCurrentRun()) return
        if (!terminal) {
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              status: 'interrupted',
            })
          )
        }
        controller.current = null
        if (!failed) setRunState({ status: 'idle' })
      }
      requestController.signal.addEventListener('abort', handleAbort, {
        once: true,
      })
      const defaultProfileId =
        providerProfiles.find((profile) => profile.isDefault)?.id ?? null
      const selectedProfileId =
        options?.providerProfileId !== undefined
          ? options.providerProfileId
          : defaultProfileId
      const selectedModelId = selectedProfileId
        ? null
        : options?.modelId !== undefined
          ? options.modelId
          : (providers.find((provider) => provider.isDefault)?.id ??
            providers[0]?.id ??
            null)

      const adoptServerConversation = (serverConversationId: string) => {
        if (serverConversationId === resolvedConversationId) return
        const previousId = resolvedConversationId
        resolvedConversationId = serverConversationId
        setMessagesByConversation((current) => {
          const migrated = (current[previousId] ?? []).map((message) => ({
            ...message,
            conversationId: serverConversationId,
          }))
          const next = { ...current, [serverConversationId]: migrated }
          delete next[previousId]
          return next
        })
        setConversations((items) =>
          items.map((item) =>
            item.id === previousId
              ? { ...item, id: serverConversationId }
              : item
          )
        )
        setActiveConversationId((current) =>
          current === previousId ? serverConversationId : current
        )
      }

      const handleEvent = (event: AiStreamEvent) => {
        if (!isCurrentRun() || requestController.signal.aborted || terminal)
          return
        if (event.type === 'run.started') {
          adoptServerConversation(event.conversation_id)
          return
        }
        if (event.type === 'content.delta') {
          const delta = event.data.delta
          if (typeof delta !== 'string') return
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              blocks: appendTextDelta(message.blocks, delta),
            })
          )
          return
        }
        if (event.type === 'component.upsert') {
          const block = parseBlock(event.data.block)
          if (!block) return
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              blocks: [...message.blocks, block],
            })
          )
          return
        }
        if (event.type === 'message.completed') {
          terminal = true
          const blocks = parseBlocks(event.data.blocks)
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              id: event.message_id,
              blocks: blocks.length ? blocks : message.blocks,
              status: 'completed',
              metrics: parseMessageMetrics(event.data),
            })
          )
          return
        }
        if (event.type === 'run.failed') {
          terminal = true
          failed = true
          const code = stringValue(event.data.code)
          const message =
            stringValue(event.data.message) || '生成失败，请稍后重试。'
          updateMessage(resolvedConversationId, assistantMessageId, (item) => ({
            ...item,
            status: 'failed',
          }))
          setRunState({
            status: 'error',
            code,
            message,
            retryable: event.data.retryable === true,
          })
        }
      }

      try {
        await streamAiRun(
          {
            message: text,
            conversation_id: conversationId,
            provider_profile_id: userId ? selectedProfileId : null,
            model_id: userId ? selectedModelId : null,
            parent_message_id: userId
              ? (options?.parentMessageId ?? null)
              : null,
            persona_id: userId ? selectedPersonaId : null,
            skill_ids: userId ? selectedSkillIds : [],
            ...(!userId && { reasoning_effort: reasoningEffort }),
          },
          {
            signal: requestController.signal,
            onEvent: handleEvent,
            onProtocolError: (error) => {
              if (
                !isCurrentRun() ||
                requestController.signal.aborted ||
                terminal
              )
                return
              failed = true
              terminal = true
              updateMessage(
                resolvedConversationId,
                assistantMessageId,
                (message) => ({
                  ...message,
                  status: 'failed',
                })
              )
              setRunState({
                status: 'error',
                code: 'AI_PROTOCOL_UNSUPPORTED',
                message: error.message,
                retryable: true,
              })
              requestController.abort()
            },
          }
        )
        if (!isCurrentRun()) return
        if (!terminal && !requestController.signal.aborted) {
          failed = true
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              status: 'interrupted',
            })
          )
          setRunState({
            status: 'error',
            code: 'AI_STREAM_INTERRUPTED',
            message: '连接提前结束，已保留收到的内容。',
            retryable: true,
          })
        }
      } catch (error) {
        if (!isCurrentRun() || terminal) return
        if (requestController.signal.aborted) {
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              status: 'interrupted',
            })
          )
        } else {
          failed = true
          updateMessage(
            resolvedConversationId,
            assistantMessageId,
            (message) => ({
              ...message,
              status: 'failed',
            })
          )
          setRunState({
            status: 'error',
            message: errorMessage(error),
            retryable: true,
          })
        }
      } finally {
        requestController.signal.removeEventListener('abort', handleAbort)
        if (isCurrentRun()) {
          if (!failed) setRunState({ status: 'idle' })
          controller.current = null
        }
      }
    },
    [
      activeConversationId,
      providerProfiles,
      providers,
      reasoningEffort,
      selectedPersonaId,
      selectedSkillIds,
      updateMessage,
      userId,
    ]
  )

  const sendMessage = useCallback(
    async (payload: AiComposerSubmitPayload) => {
      if (pendingEdit.current) {
        throw new AiComposerSubmitError('正在保存编辑，请稍后再发送。')
      }
      if (payload.files.length) {
        throw new AiComposerSubmitError(
          '当前服务暂不支持附件，请移除附件后重试。'
        )
      }
      const prompt = buildAiCommandPrompt(payload.markdown, payload.commandId)
      await sendTextMessage(prompt, {
        providerProfileId: providerProfileId(payload.modelId),
        modelId: publicModelId(payload.modelId),
      })
    },
    [sendTextMessage]
  )

  const stop = useCallback(() => controller.current?.abort(), [])

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (controller.current || pendingEdit.current || !content.trim()) return
      const items = messagesByConversation[activeConversationId] ?? []
      const index = items.findIndex((message) => message.id === messageId)
      if (index < 0 || items[index].role !== 'user') return
      const operation = {}
      const generation = workspaceGeneration.current
      const history = historyGeneration.current
      const isCurrentEdit = () =>
        pendingEdit.current === operation &&
        workspaceGeneration.current === generation &&
        historyGeneration.current === history
      pendingEdit.current = operation
      if (user && !messageId.includes('-local-')) {
        try {
          await updateAiMessage(messageId, content)
        } catch (error) {
          if (isCurrentEdit()) {
            pendingEdit.current = null
            setRunState({ status: 'error', message: errorMessage(error) })
          }
          return
        }
      }
      if (!isCurrentEdit()) return
      pendingEdit.current = null
      setMessagesByConversation((current) => ({
        ...current,
        [activeConversationId]: (current[activeConversationId] ?? [])
          .slice(0, index + 1)
          .map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  blocks: [{ type: 'text', text: content, format: 'markdown' }],
                }
              : message
          ),
      }))
      await sendTextMessage(content, {
        reuseUser: true,
        parentMessageId: messageId,
      })
    },
    [activeConversationId, messagesByConversation, sendTextMessage, user]
  )

  const regenerate = useCallback(
    async (messageId: string) => {
      if (controller.current || pendingEdit.current) return
      const items = messagesByConversation[activeConversationId] ?? []
      const index = items.findIndex((message) => message.id === messageId)
      if (index < 0) return
      const source = [...items.slice(0, index)]
        .reverse()
        .find((message) => message.role === 'user')
      if (!source) return
      setMessagesByConversation((current) => ({
        ...current,
        [activeConversationId]: (current[activeConversationId] ?? []).slice(
          0,
          index
        ),
      }))
      await sendTextMessage(firstText(source.blocks), {
        reuseUser: true,
        parentMessageId: source.id,
      })
    },
    [activeConversationId, messagesByConversation, sendTextMessage]
  )

  const retryLast = useCallback(() => {
    const items = messagesByConversation[activeConversationId] ?? []
    const message = [...items]
      .reverse()
      .find((item) => item.role === 'assistant')
    if (message) regenerate(message.id)
  }, [activeConversationId, messagesByConversation, regenerate])

  const setFeedback = useCallback(
    (messageId: string, value: 'like' | 'dislike' | 'none') => {
      updateMessage(activeConversationId, messageId, (message) => ({
        ...message,
        feedback: value === 'none' ? null : value,
      }))
      if (user && !messageId.includes('-local-'))
        void updateAiFeedback(messageId, value).catch((error: unknown) =>
          setRunState({ status: 'error', message: errorMessage(error) })
        )
    },
    [activeConversationId, updateMessage, user]
  )

  const saveProvider = useCallback(
    async (draft: AiProviderDraft) => {
      if (!user) {
        throw new Error('登录后可以保存自己的模型和 API Key。')
      }
      const saved = await saveAiProviderProfile({
        provider: draft.provider as
          | 'deepseek'
          | 'openai'
          | 'openrouter'
          | 'openai-compatible',
        name: draft.name,
        base_url: draft.baseUrl,
        model: draft.model,
        api_key: draft.apiKey ?? null,
        is_default: draft.isDefault,
      })
      if (saved)
        setProviderProfiles((items) => [
          mapProviderProfile(saved),
          ...items.filter((item) => item.id !== saved.id),
        ])
    },
    [user]
  )

  const selectPersona = useCallback(
    (personaId: string | null) => {
      if (!userId) return
      if (
        personaId !== null &&
        !personas.some((persona) => persona.id === personaId)
      )
        return
      setSelectedPersonaId(personaId)
    },
    [personas, userId]
  )

  const toggleSkill = useCallback(
    (skillId: string) => {
      if (!userId || !skills.some((skill) => skill.id === skillId)) return
      setSelectedSkillIds((current) => {
        if (current.includes(skillId)) {
          return current.filter((id) => id !== skillId)
        }
        if (current.length >= MAX_SELECTED_AI_SKILLS) return current
        return [...current, skillId]
      })
    },
    [skills, userId]
  )

  const savePersona = useCallback(
    async ({ id, ...payload }: AiPersonaDraft) => {
      if (!userId) throw new Error('登录后可以管理自己的角色。')
      const saved = id
        ? await updateAiPersona(id, payload)
        : await createAiPersona(payload)
      if (!saved) throw new Error('角色保存失败，请重试。')
      setPersonas((items) => [
        saved,
        ...items.filter((item) => item.id !== saved.id),
      ])
      setCapabilityStatus('ready')
      return saved
    },
    [userId]
  )

  const removePersona = useCallback(
    async (personaId: string) => {
      if (!userId) throw new Error('登录后可以管理自己的角色。')
      await deleteAiPersona(personaId)
      setPersonas((items) => items.filter((item) => item.id !== personaId))
      setSelectedPersonaId((current) =>
        current === personaId ? null : current
      )
    },
    [userId]
  )

  const saveSkill = useCallback(
    async ({ id, ...payload }: AiSkillDraft) => {
      if (!userId) throw new Error('登录后可以管理自己的 Skills。')
      const saved = id
        ? await updateAiSkill(id, payload)
        : await createAiSkill(payload)
      if (!saved) throw new Error('Skill 保存失败，请重试。')
      setSkills((items) => [
        saved,
        ...items.filter((item) => item.id !== saved.id),
      ])
      setCapabilityStatus('ready')
      return saved
    },
    [userId]
  )

  const removeSkill = useCallback(
    async (skillId: string) => {
      if (!userId) throw new Error('登录后可以管理自己的 Skills。')
      await deleteAiSkill(skillId)
      setSkills((items) => items.filter((item) => item.id !== skillId))
      setSelectedSkillIds((current) => current.filter((id) => id !== skillId))
    },
    [userId]
  )

  return {
    conversations,
    activeConversationId,
    messages: messagesByConversation[activeConversationId] ?? [],
    runState,
    providers,
    providerProfiles,
    reasoningEffort,
    setReasoningEffort,
    personas,
    skills,
    selectedPersonaId,
    selectedSkillIds,
    capabilityStatus,
    capabilityError,
    isAuthenticated: Boolean(userId),
    accountKey: userId,
    startConversation,
    selectConversation,
    sendMessage,
    stop,
    editMessage,
    regenerate,
    retryLast,
    setFeedback,
    saveProvider,
    selectPersona,
    toggleSkill,
    refreshCapabilities,
    savePersona,
    removePersona,
    saveSkill,
    removeSkill,
  }
}

function mapConversation(value: {
  id: string
  title: string
  updated_at?: string
}): AiUiConversation {
  return { id: value.id, title: value.title, updatedAt: value.updated_at }
}

function mapProviderProfile(value: {
  id: string
  provider: string
  name: string
  base_url: string
  model: string
  is_default: boolean
  has_api_key: boolean
  api_key_hint?: string | null
}): AiUiProviderProfile {
  return {
    id: value.id,
    provider: value.provider,
    name: value.name,
    baseUrl: value.base_url,
    model: value.model,
    isDefault: value.is_default,
    hasApiKey: value.has_api_key,
    apiKeyHint: value.api_key_hint,
  }
}

function mapMessage(value: {
  id: string
  conversation_id: string
  role: string
  blocks: unknown[]
  status: string
  feedback?: string | null
}): AiUiMessage {
  return {
    id: value.id,
    conversationId: value.conversation_id,
    role: isRole(value.role) ? value.role : 'assistant',
    blocks: parseBlocks(value.blocks),
    status: isMessageStatus(value.status) ? value.status : 'completed',
    feedback:
      value.feedback === 'like' || value.feedback === 'dislike'
        ? value.feedback
        : null,
  }
}

function parseMessageMetrics({
  duration_ms,
  usage,
}: AiStreamEvent['data']): AiUiMessage['metrics'] {
  const safeCount = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined
  const durationMs = safeCount(duration_ms)
  const metrics: NonNullable<AiUiMessage['metrics']> = {}
  if (durationMs !== undefined) metrics.durationMs = durationMs
  if (usage && typeof usage === 'object' && !Array.isArray(usage)) {
    const inputTokens = safeCount(usage.input_tokens)
    const outputTokens = safeCount(usage.output_tokens)
    const totalTokens = safeCount(usage.total_tokens)
    if (
      inputTokens !== undefined &&
      outputTokens !== undefined &&
      totalTokens === inputTokens + outputTokens
    ) {
      metrics.tokenUsage = { inputTokens, outputTokens, totalTokens }
    }
  }
  return metrics.durationMs !== undefined || metrics.tokenUsage
    ? metrics
    : undefined
}

function parseBlocks(value: unknown): AiContentBlock[] {
  return Array.isArray(value)
    ? value
        .map(parseBlock)
        .filter((block): block is AiContentBlock => Boolean(block))
    : []
}

function parseBlock(value: unknown): AiContentBlock | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null
  const type = (value as { type?: unknown }).type
  if (
    !['text', 'table', 'chart', 'link', 'record', 'custom'].includes(
      String(type)
    )
  )
    return null
  return value as AiContentBlock
}

function appendTextDelta(
  blocks: AiContentBlock[],
  delta: string
): AiContentBlock[] {
  const index = blocks.findIndex((block) => block.type === 'text')
  if (index < 0)
    return [...blocks, { type: 'text', text: delta, format: 'markdown' }]
  return blocks.map((block, position) =>
    position === index && block.type === 'text'
      ? { ...block, text: block.text + delta }
      : block
  )
}

function firstText(blocks: AiContentBlock[]) {
  return blocks.find((block) => block.type === 'text')?.text ?? ''
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'AI 请求失败，请稍后重试。'
}

function providerProfileId(modelId: string) {
  return modelId.startsWith('profile:')
    ? modelId.slice('profile:'.length)
    : null
}

function publicModelId(modelId: string) {
  return modelId.startsWith('model:') ? modelId.slice('model:'.length) : null
}

function isRole(value: string): value is AiUiMessage['role'] {
  return ['user', 'assistant', 'system', 'tool'].includes(value)
}

function isMessageStatus(value: string): value is AiUiMessage['status'] {
  return [
    'pending',
    'streaming',
    'completed',
    'interrupted',
    'failed',
  ].includes(value)
}
