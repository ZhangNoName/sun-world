import { useCallback, useEffect, useRef, useState } from 'react'
import { sendAiStreamMessage } from '../api'
import type { AiConversation, AiMessage } from '../types'

const initialId = 'local-default'
const now = () => new Date().toISOString()
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function useAiChat() {
  const [conversations, setConversations] = useState<AiConversation[]>([
    { id: initialId, title: 'New chat', createdAt: now(), updatedAt: now() },
  ])
  const [activeConversationId, setActiveConversationId] = useState(initialId)
  const [messages, setMessages] = useState<Record<string, AiMessage[]>>({
    [initialId]: [],
  })
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const update = useCallback(
    (conversationId: string, messageId: string, patch: Partial<AiMessage>) =>
      setMessages((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? []).map((message) =>
          message.id === messageId ? { ...message, ...patch } : message
        ),
      })),
    []
  )
  const startConversation = useCallback(() => {
    const next = id('chat')
    const stamp = now()
    setConversations((items) => [
      { id: next, title: 'New chat', createdAt: stamp, updatedAt: stamp },
      ...items,
    ])
    setMessages((items) => ({ ...items, [next]: [] }))
    setActiveConversationId(next)
  }, [])
  const selectConversation = useCallback((value: string) => {
    setActiveConversationId(value)
    setErrorMessage('')
  }, [])
  const abort = useCallback(() => controller.current?.abort(), [])
  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || isSending) return
      const conversationId = activeConversationId
      const assistantId = id('assistant')
      setMessages((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] ?? []),
          {
            id: id('user'),
            role: 'user',
            content: text,
            createdAt: now(),
            status: 'done',
          },
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            createdAt: now(),
            status: 'streaming',
          },
        ],
      }))
      setConversations((items) =>
        items.map((item) =>
          item.id === conversationId && item.title === 'New chat'
            ? { ...item, title: text.slice(0, 42) }
            : item
        )
      )
      setIsSending(true)
      setErrorMessage('')
      controller.current = new AbortController()
      try {
        await sendAiStreamMessage(text, conversationId, {
          signal: controller.current.signal,
          onMessage: (token) =>
            setMessages((current) => ({
              ...current,
              [conversationId]: (current[conversationId] ?? []).map(
                (message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + token }
                    : message
              ),
            })),
          onComplete: () =>
            update(conversationId, assistantId, { status: 'done' }),
          onError: (error) => {
            if (error.name !== 'AbortError') {
              setErrorMessage(error.message)
              update(conversationId, assistantId, { status: 'error' })
            }
          },
        })
      } finally {
        setIsSending(false)
        controller.current = null
      }
    },
    [activeConversationId, isSending, update]
  )
  return {
    conversations,
    activeConversationId,
    activeConversation: conversations.find(
      (item) => item.id === activeConversationId
    ),
    activeMessages: messages[activeConversationId] ?? [],
    isSending,
    errorMessage,
    startConversation,
    selectConversation,
    sendMessage,
    abort,
  }
}
