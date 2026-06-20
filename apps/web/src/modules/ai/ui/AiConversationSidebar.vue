<script setup lang="ts">
import type { AiConversation } from '../types'

defineProps<{
  activeId: string
  conversations: AiConversation[]
}>()

const emit = defineEmits<{
  newChat: []
  select: [id: string]
}>()
</script>

<template>
  <aside class="conversation-sidebar">
    <button class="new-chat" type="button" @click="emit('newChat')">
      New chat
    </button>
    <input class="conversation-search" placeholder="Search chats" />
    <nav class="conversation-list" aria-label="Recent conversations">
      <button
        v-for="conversation in conversations"
        :key="conversation.id"
        class="conversation-item"
        :class="{ active: conversation.id === activeId }"
        type="button"
        @click="emit('select', conversation.id)"
      >
        {{ conversation.title }}
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.conversation-sidebar {
  width: 280px;
  min-width: 240px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-surface-muted);
}

.new-chat,
.conversation-search,
.conversation-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
}

.new-chat {
  height: 40px;
  background: var(--color-surface-card);
  color: var(--color-text-primary);
  cursor: pointer;
}

.conversation-search {
  height: 36px;
  padding: 0 10px;
  background: var(--color-surface-card);
  color: var(--color-text-primary);
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.conversation-item {
  min-height: 36px;
  padding: 8px 10px;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item:hover,
.conversation-item.active {
  background: var(--color-surface-card);
  border-color: var(--color-border-subtle);
}

@media (max-width: 860px) {
  .conversation-sidebar {
    width: 100%;
    min-width: 0;
    height: auto;
    max-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
}
</style>
