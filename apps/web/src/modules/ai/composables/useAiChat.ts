import { computed, nextTick, ref } from 'vue'
import { sendAiStreamMessage } from '../api'
import type { AiConversation, AiMessage } from '../types'

const DEFAULT_CONVERSATION_ID = 'local-default'

function now() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export function useAiChat() {
  const conversations = ref<AiConversation[]>([
    {
      id: DEFAULT_CONVERSATION_ID,
      title: 'New chat',
      createdAt: now(),
      updatedAt: now(),
    },
  ])
  const activeConversationId = ref(DEFAULT_CONVERSATION_ID)
  const messages = ref<Record<string, AiMessage[]>>({
    [DEFAULT_CONVERSATION_ID]: [],
  })
  const isSending = ref(false)
  const errorMessage = ref('')

  const activeConversation = computed(() =>
    conversations.value.find((item) => item.id === activeConversationId.value)
  )

  const activeMessages = computed(
    () => messages.value[activeConversationId.value] ?? []
  )

  function startConversation() {
    const id = createId('chat')
    const timestamp = now()
    conversations.value.unshift({
      id,
      title: 'New chat',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    messages.value[id] = []
    activeConversationId.value = id
  }

  function selectConversation(id: string) {
    if (messages.value[id]) {
      activeConversationId.value = id
      errorMessage.value = ''
    }
  }

  async function sendMessage(content: string) {
    const text = content.trim()
    if (!text || isSending.value) return

    const conversationId = activeConversationId.value
    const timestamp = now()
    const userMessage: AiMessage = {
      id: createId('user'),
      role: 'user',
      content: text,
      createdAt: timestamp,
      status: 'done',
    }
    const assistantMessage: AiMessage = {
      id: createId('assistant'),
      role: 'assistant',
      content: '',
      createdAt: now(),
      status: 'streaming',
    }

    messages.value[conversationId] = [
      ...(messages.value[conversationId] ?? []),
      userMessage,
      assistantMessage,
    ]
    renameConversation(conversationId, text)
    isSending.value = true
    errorMessage.value = ''
    await nextTick()

    try {
      await sendAiStreamMessage(text, conversationId, {
        onMessage: (token) => {
          updateAssistantMessage(conversationId, assistantMessage.id, {
            content:
              getAssistantMessage(conversationId, assistantMessage.id).content +
              token,
          })
        },
        onComplete: () => {
          updateAssistantMessage(conversationId, assistantMessage.id, {
            status: 'done',
          })
        },
        onError: (error) => {
          const current = getAssistantMessage(
            conversationId,
            assistantMessage.id
          )
          updateAssistantMessage(conversationId, assistantMessage.id, {
            status: 'error',
            content: current.content || 'The assistant could not respond.',
          })
          errorMessage.value = error.message
        },
      })
    } finally {
      isSending.value = false
      if (
        getAssistantMessage(conversationId, assistantMessage.id).status ===
        'streaming'
      ) {
        updateAssistantMessage(conversationId, assistantMessage.id, {
          status: 'done',
        })
      }
      touchConversation(conversationId)
    }
  }

  function getAssistantMessage(conversationId: string, messageId: string) {
    return (
      messages.value[conversationId]?.find(
        (message) => message.id === messageId
      ) ?? assistantFallback(messageId)
    )
  }

  function updateAssistantMessage(
    conversationId: string,
    messageId: string,
    patch: Partial<AiMessage>
  ) {
    messages.value[conversationId] = (messages.value[conversationId] ?? []).map(
      (message) =>
        message.id === messageId ? { ...message, ...patch } : message
    )
  }

  function assistantFallback(messageId: string): AiMessage {
    return {
      id: messageId,
      role: 'assistant',
      content: '',
      createdAt: now(),
      status: 'streaming',
    }
  }

  function renameConversation(id: string, text: string) {
    const item = conversations.value.find(
      (conversation) => conversation.id === id
    )
    if (!item || item.title !== 'New chat') return
    item.title = text.length > 42 ? `${text.slice(0, 42)}...` : text
  }

  function touchConversation(id: string) {
    const item = conversations.value.find(
      (conversation) => conversation.id === id
    )
    if (item) {
      item.updatedAt = now()
    }
  }

  return {
    activeConversation,
    activeConversationId,
    activeMessages,
    conversations,
    errorMessage,
    isSending,
    selectConversation,
    sendMessage,
    startConversation,
  }
}
