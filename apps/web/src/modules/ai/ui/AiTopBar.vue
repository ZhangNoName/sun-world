<script setup lang="ts">
import type { AiConversation, AiProviderOption } from '../types'

defineProps<{
  conversation?: AiConversation
  error?: string
  provider: AiProviderOption
}>()
</script>

<template>
  <header class="ai-topbar">
    <div>
      <p class="eyebrow">Sun World AI</p>
      <h2>{{ conversation?.title || 'New chat' }}</h2>
    </div>
    <div class="provider-pill">
      <strong>{{ provider.name }}</strong>
      <span>{{ provider.model }}</span>
    </div>
    <p v-if="error" class="connection-error">{{ error }}</p>
  </header>
</template>

<style scoped>
.ai-topbar {
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface-page);
}

.eyebrow {
  margin: 0 0 2px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-pill {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  color: var(--color-text-primary);
  background: var(--color-surface-card);
}

.provider-pill span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.connection-error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-danger, #b42318);
  font-size: var(--font-size-sm);
}
</style>
