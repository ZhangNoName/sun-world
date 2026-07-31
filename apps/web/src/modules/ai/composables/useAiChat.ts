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

import {
  fetchAiConversation,
  fetchAiConversations,
  fetchAiProviderProfiles,
  fetchAiProviders,
  saveAiProviderProfile,
  streamAiRun,
  updateAiFeedback,
  updateAiMessage,
} from '../api'

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
  const [providers, setProviders] = useState<AiUiProvider[]>([
    {
      id: 'deepseek',
      name: 'DeepSeek',
      defaultBaseUrl: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
    },
  ])
  const [providerProfiles, setProviderProfiles] = useState<
    AiUiProviderProfile[]
  >([])
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(() => {
    let cancelled = false
    void fetchAiProviders()
      .then((items) => {
        if (!cancelled && items)
          setProviders(
            items.map((item) => ({
              id: item.id,
              name: item.name,
              defaultBaseUrl: item.default_base_url,
              defaultModel: item.default_model,
            }))
          )
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void Promise.all([fetchAiConversations(), fetchAiProviderProfiles()])
      .then(([conversationItems, profileItems]) => {
        if (cancelled) return
        const mapped = (conversationItems ?? []).map(mapConversation)
        if (mapped.length) {
          setConversations(mapped)
          setActiveConversationId(mapped[0]!.id)
        }
        setProviderProfiles((profileItems ?? []).map(mapProviderProfile))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user])

  const startConversation = useCallback(() => {
    const conversation = newConversation()
    setConversations((items) => [conversation, ...items])
    setMessagesByConversation((items) => ({
      ...items,
      [conversation.id]: [],
    }))
    setActiveConversationId(conversation.id)
    setRunState({ status: 'idle' })
  }, [])

  const selectConversation = useCallback(
    (conversationId: string) => {
      controller.current?.abort()
      setActiveConversationId(conversationId)
      setRunState({ status: 'idle' })
      if (!user || conversationId.includes('-local-')) return
      void fetchAiConversation(conversationId)
        .then((conversation) => {
          if (!conversation) return
          setMessagesByConversation((current) => ({
            ...current,
            [conversationId]: (conversation.messages ?? []).map(mapMessage),
          }))
        })
        .catch((error: unknown) =>
          setRunState({ status: 'error', message: errorMessage(error) })
        )
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
      }
    ) => {
      const text = raw.trim()
      if (!text || runState.status === 'running') return
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
              blocks: [
                {
                  type: 'text',
                  text: `${firstText(message.blocks)}${delta}`,
                  format: 'markdown',
                },
              ],
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
            conversation_id: conversationId.includes('-local-')
              ? null
              : conversationId,
            provider_profile_id:
              options?.providerProfileId !== undefined
                ? options.providerProfileId
                : (providerProfiles.find((profile) => profile.isDefault)?.id ??
                  null),
            parent_message_id: options?.parentMessageId ?? null,
          },
          {
            signal: requestController.signal,
            onEvent: handleEvent,
            onProtocolError: (error) => {
              failed = true
              setRunState({
                status: 'error',
                code: 'AI_PROTOCOL_UNSUPPORTED',
                message: error.message,
                retryable: true,
              })
            },
          }
        )
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
        if (!failed) setRunState({ status: 'idle' })
        if (controller.current === requestController) controller.current = null
      }
    },
    [activeConversationId, providerProfiles, runState.status, updateMessage]
  )

  const sendMessage = useCallback(
    async (payload: AiComposerSubmitPayload) => {
      if (payload.files.length) {
        throw new AiComposerSubmitError(
          '当前服务暂不支持附件，请移除附件后重试。'
        )
      }
      if (payload.commandId) {
        throw new AiComposerSubmitError(
          '当前服务暂不支持命令，请移除命令后重试。'
        )
      }
      await sendTextMessage(payload.markdown, {
        providerProfileId: providerProfileId(payload.modelId),
      })
    },
    [sendTextMessage]
  )

  const stop = useCallback(() => controller.current?.abort(), [])

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const items = messagesByConversation[activeConversationId] ?? []
      const index = items.findIndex((message) => message.id === messageId)
      if (index < 0) return
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
      if (user && !messageId.includes('-local-')) {
        try {
          await updateAiMessage(messageId, content)
        } catch (error) {
          setRunState({ status: 'error', message: errorMessage(error) })
          return
        }
      }
      await sendTextMessage(content, {
        reuseUser: true,
        parentMessageId: messageId,
      })
    },
    [activeConversationId, messagesByConversation, sendTextMessage, user]
  )

  const regenerate = useCallback(
    async (messageId: string) => {
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
        setRunState({
          status: 'error',
          code: 'AI_AUTH_REQUIRED',
          message: '登录后可以保存自己的模型和 API Key。',
        })
        return
      }
      try {
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
      } catch (error) {
        setRunState({ status: 'error', message: errorMessage(error) })
      }
    },
    [user]
  )

  return {
    conversations,
    activeConversationId,
    messages: messagesByConversation[activeConversationId] ?? [],
    runState,
    providers,
    providerProfiles,
    startConversation,
    selectConversation,
    sendMessage,
    stop,
    editMessage,
    regenerate,
    retryLast,
    setFeedback,
    saveProvider,
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
