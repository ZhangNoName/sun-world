<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { SunIcon } from '@sun-world/icons/vue'
import { SunButton } from '@sun-world/ui/button'
import { SunChatShell } from '@sun-world/ui/chat-shell'
import { AI_PROVIDER_OPTIONS } from '@/modules/ai/api'
import { useAiChat } from '@/modules/ai/composables/useAiChat'
import AiComposer from '@/modules/ai/ui/AiComposer.vue'
import AiConversationSidebar from '@/modules/ai/ui/AiConversationSidebar.vue'
import AiMessageStream from '@/modules/ai/ui/AiMessageStream.vue'

const {
  activeConversationId,
  activeMessages,
  conversations,
  errorMessage,
  isSending,
  selectConversation,
  sendMessage,
  startConversation,
} = useAiChat()

const provider = computed(() => AI_PROVIDER_OPTIONS[0])
const SIDEBAR_MIN_WIDTH = 232
const SIDEBAR_MAX_WIDTH = 380
const SIDEBAR_DEFAULT_WIDTH = 288
const SIDEBAR_STORAGE_KEY = 'sun-world-ai-sidebar-width'

const sidebarCollapsed = ref(false)
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH)

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

function startSidebarResize(event: PointerEvent) {
  if (sidebarCollapsed.value) return
  event.preventDefault()

  const move = (moveEvent: PointerEvent) => {
    sidebarWidth.value = clampSidebarWidth(moveEvent.clientX)
  }
  const stop = () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth.value))
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
  window.addEventListener('pointercancel', stop, { once: true })
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function openSidebar() {
  sidebarCollapsed.value = false
}

function createConversationFromRail() {
  startConversation()
  sidebarCollapsed.value = false
}

function collapseForMobile() {
  if (window.innerWidth <= 720) {
    sidebarCollapsed.value = true
  }
}

onMounted(() => {
  const storedWidth = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY))
  if (Number.isFinite(storedWidth) && storedWidth > 0) {
    sidebarWidth.value = clampSidebarWidth(storedWidth)
  }
  collapseForMobile()
  window.addEventListener('resize', collapseForMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', collapseForMobile)
})
</script>

<template>
  <SunChatShell
    class="gpt-chat-shell"
    :sidebar-collapsed="sidebarCollapsed"
    :sidebar-width="sidebarWidth"
    aria-label="Sun World AI chat"
  >
    <template v-if="sidebarCollapsed" #rail>
      <div class="collapsed-rail">
        <button
          class="rail-expand-trigger toggle-sidebar"
          type="button"
          title="显示侧边栏"
          aria-label="显示侧边栏"
          @click="openSidebar"
        >
          <img src="/logo.svg" alt="" class="rail-logo" />
          <SunIcon class="rail-expand-icon" name="panel-left-open" size="md" />
        </button>
        <SunButton
          variant="icon"
          size="icon"
          title="新聊天"
          aria-label="新聊天"
          @click="createConversationFromRail"
        >
          <SunIcon name="plus" size="md" />
        </SunButton>
        <SunButton
          variant="icon"
          size="icon"
          title="搜索聊天"
          aria-label="搜索聊天"
          @click="openSidebar"
        >
          <SunIcon name="search" size="md" />
        </SunButton>
        <span class="rail-avatar">SW</span>
      </div>
    </template>

    <template #sidebar>
      <AiConversationSidebar
        :active-id="activeConversationId"
        :conversations="conversations"
        @new-chat="startConversation"
        @resize-start="startSidebarResize"
        @select="selectConversation"
        @toggle-sidebar="toggleSidebar"
      />
    </template>

    <main class="chat-workspace">
      <div class="workspace-status">
        <button class="model-chip" type="button">
          <strong>{{ provider.name }}</strong>
          <span>{{ provider.model }}</span>
        </button>
      </div>
      <p v-if="errorMessage" class="connection-error">{{ errorMessage }}</p>
      <AiMessageStream :messages="activeMessages" />
      <div class="composer-dock">
        <AiComposer :loading="isSending" @send="sendMessage" />
      </div>
    </main>
    <template #floating>
      <button
        v-if="!sidebarCollapsed"
        class="mobile-scrim"
        type="button"
        aria-label="隐藏侧边栏"
        @click="toggleSidebar"
      ></button>
    </template>
  </SunChatShell>
</template>

<style scoped>
.gpt-chat-shell {
  height: 100%;
  min-height: 100dvh;
  background: #fff;
  color: #171717;
}

.chat-workspace {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
}

.collapsed-rail {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px 10px 16px;
}

.collapsed-rail :deep(.sun-button) {
  --sun-ui-color-primary: #202020;
}

.rail-expand-trigger {
  position: relative;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  flex: none;
  margin-bottom: 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #202020;
  cursor: ew-resize;
}

.rail-expand-trigger:hover,
.rail-expand-trigger:focus-visible {
  background: #f1f1f1;
}

.rail-logo,
.rail-expand-icon {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  transition: opacity 0.12s ease;
}

.rail-logo {
  width: 28px;
  height: 28px;
  display: block;
  opacity: 1;
}

.rail-expand-icon {
  opacity: 0;
}

.rail-expand-trigger:hover .rail-logo,
.rail-expand-trigger:focus-visible .rail-logo {
  opacity: 0;
}

.rail-expand-trigger:hover .rail-expand-icon,
.rail-expand-trigger:focus-visible .rail-expand-icon {
  opacity: 1;
}

.rail-avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  margin-top: auto;
  border-radius: 999px;
  background: #9b5cc6;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.workspace-status {
  position: absolute;
  top: 18px;
  right: 22px;
  z-index: 2;
}

.model-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #ececec;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #171717;
  font: inherit;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(12px);
}

.model-chip span {
  color: #777;
  font-size: 12px;
}

.connection-error {
  position: absolute;
  top: 62px;
  left: 50%;
  z-index: 2;
  max-width: min(520px, calc(100% - 40px));
  margin: 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: #fff1f1;
  color: #b42318;
  font-size: 13px;
  transform: translateX(-50%);
}

.composer-dock {
  position: absolute;
  left: 50%;
  bottom: 34px;
  z-index: 3;
  display: flex;
  justify-content: center;
  width: min(820px, calc(100% - 36px));
  transform: translateX(-50%);
}

.mobile-scrim {
  display: none;
}

@media (max-width: 720px) {
  .workspace-status {
    top: 14px;
    right: 14px;
  }

  .model-chip span {
    display: none;
  }

  .composer-dock {
    bottom: calc(18px + env(safe-area-inset-bottom, 0));
    width: calc(100% - 24px);
  }

  .mobile-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 10;
    border: 0;
    background: rgba(15, 23, 42, 0.18);
  }
}
</style>
