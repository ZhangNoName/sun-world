<script lang="ts" setup>
import { computed } from 'vue'
import { AI_PROVIDER_OPTIONS } from '@/modules/ai/api'
import { useAiChat } from '@/modules/ai/composables/useAiChat'
import AiComposer from '@/modules/ai/ui/AiComposer.vue'
import AiConversationSidebar from '@/modules/ai/ui/AiConversationSidebar.vue'
import AiMessageStream from '@/modules/ai/ui/AiMessageStream.vue'
import AiTopBar from '@/modules/ai/ui/AiTopBar.vue'

const {
  activeConversation,
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
</script>

<template>
  <div class="gpt-chat-shell">
    <AiConversationSidebar
      :active-id="activeConversationId"
      :conversations="conversations"
      @new-chat="startConversation"
      @select="selectConversation"
    />

    <main class="chat-workspace">
      <AiTopBar
        :conversation="activeConversation"
        :error="errorMessage"
        :provider="provider"
      />
      <AiMessageStream :messages="activeMessages" />
      <footer class="composer-dock">
        <AiComposer :loading="isSending" @send="sendMessage" />
      </footer>
    </main>
  </div>
</template>

<style scoped>
.gpt-chat-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  width: 100%;
  background: var(--color-surface-page);
  color: var(--color-text-primary);
}

.chat-workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.composer-dock {
  display: flex;
  justify-content: center;
  padding: 14px 18px 22px;
  background: linear-gradient(
    transparent,
    var(--color-surface-page) 18px,
    var(--color-surface-page)
  );
}

@media (max-width: 860px) {
  .gpt-chat-shell {
    flex-direction: column;
  }
}
</style>
