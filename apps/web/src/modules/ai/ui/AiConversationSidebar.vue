<script setup lang="ts">
import { computed, ref } from 'vue'
import { SunIcon } from '@sun-world/icons/vue'
import { SunButton } from '@sun-world/ui/button'
import type { AiConversation } from '../types'

const props = defineProps<{
  activeId: string
  conversations: AiConversation[]
}>()

const emit = defineEmits<{
  newChat: []
  resizeStart: [event: PointerEvent]
  select: [id: string]
  toggleSidebar: []
}>()

const query = ref('')
const filteredConversations = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return props.conversations
  return props.conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(keyword)
  )
})
</script>

<template>
  <aside class="conversation-sidebar">
    <div class="sidebar-header">
      <div class="brand-lockup">
        <img src="/logo.svg" alt="Sun World" />
        <strong>Sun AI</strong>
      </div>
      <SunButton
        class="toggle-sidebar"
        variant="icon"
        size="icon"
        title="隐藏侧边栏"
        aria-label="隐藏侧边栏"
        @click="emit('toggleSidebar')"
      >
        <SunIcon name="panel-left" size="md" />
      </SunButton>
    </div>

    <div class="sidebar-actions">
      <SunButton
        class="sidebar-action"
        variant="secondary"
        size="sm"
        title="新聊天"
        aria-label="新聊天"
        @click="emit('newChat')"
      >
        <SunIcon name="plus" :size="15" />
        <span>新聊天</span>
      </SunButton>
      <label class="conversation-search">
        <SunIcon name="search" :size="15" />
        <input v-model="query" placeholder="搜索聊天" />
      </label>
    </div>

    <nav class="conversation-list" aria-label="Recent conversations">
      <p class="conversation-section-title">最近</p>
      <button
        v-for="conversation in filteredConversations"
        :key="conversation.id"
        class="conversation-item"
        :class="{ active: conversation.id === activeId }"
        type="button"
        @click="emit('select', conversation.id)"
      >
        {{ conversation.title }}
      </button>
      <p v-if="filteredConversations.length === 0" class="conversation-empty">
        没有匹配的聊天
      </p>
    </nav>
    <div class="sidebar-account">
      <span class="account-avatar">SW</span>
      <span class="account-copy">
        <strong>Sun World</strong>
        <small>AI workspace</small>
      </span>
    </div>
    <div
      class="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖拽调整侧边栏宽度"
      tabindex="0"
      @pointerdown="emit('resizeStart', $event)"
    ></div>
  </aside>
</template>

<style scoped>
.conversation-sidebar {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 12px 12px;
  background: #f7f7f8;
  color: #171717;
}

.sidebar-header,
.brand-lockup,
.sidebar-actions,
.sidebar-account,
.account-copy {
  display: flex;
  align-items: center;
}

.sidebar-header {
  justify-content: space-between;
  min-height: 40px;
}

.brand-lockup {
  min-width: 0;
  gap: 9px;
  font-size: 18px;
  font-weight: 700;
}

.brand-lockup img {
  width: 28px;
  height: 28px;
  display: block;
}

.toggle-sidebar {
  --sun-ui-color-primary: #333;
}

.sidebar-actions {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.sidebar-action {
  width: 100%;
  justify-content: flex-start;
  gap: 8px;
  border-radius: 10px;
  background: transparent;
  border-color: transparent;
  color: #1f1f1f;
  font-weight: 500;
}

.sidebar-action:hover,
.conversation-search:focus-within {
  background: #ededed;
}

.conversation-search {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  padding: 0 10px;
  color: #424242;
}

.conversation-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.conversation-search input::placeholder {
  color: #6f6f6f;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 0;
}

.conversation-section-title {
  margin: 8px 8px 6px;
  color: #111;
  font-size: 13px;
  font-weight: 700;
}

.conversation-item {
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #2f2f2f;
  font: inherit;
  font-size: 14px;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item:hover,
.conversation-item.active {
  background: #e9e9e9;
}

.conversation-empty {
  margin: 10px 8px;
  color: #777;
  font-size: 13px;
}

.sidebar-account {
  margin-top: auto;
  gap: 10px;
  min-height: 52px;
  border-top: 1px solid #e7e7e7;
  padding: 10px 4px 0;
}

.account-avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #9b5cc6;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.account-copy {
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.account-copy strong,
.account-copy small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy small {
  color: #777;
  font-size: 12px;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
}

.resize-handle::after {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 3px;
  width: 2px;
  border-radius: 999px;
  background: transparent;
}

.resize-handle:hover::after,
.resize-handle:focus-visible::after {
  background: #d7d7d7;
}

@media (max-width: 860px) {
  .conversation-sidebar {
    box-shadow: 20px 0 48px rgba(15, 23, 42, 0.16);
  }

  .resize-handle {
    display: none;
  }
}
</style>
