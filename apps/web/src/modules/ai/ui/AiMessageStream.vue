<script setup lang="ts">
import type { AiMessage } from '../types'

defineProps<{
  messages: AiMessage[]
}>()
</script>

<template>
  <section class="message-stream" aria-live="polite">
    <div v-if="messages.length === 0" class="empty-state">
      <h1>How can I help?</h1>
      <p>Ask a question, draft a post, or test the shared AI API path.</p>
    </div>
    <article
      v-for="message in messages"
      :key="message.id"
      class="message-row"
      :class="message.role"
    >
      <div class="message-avatar">
        {{ message.role === 'user' ? 'You' : 'AI' }}
      </div>
      <div class="message-card">
        <p>{{ message.content || 'Thinking...' }}</p>
        <span v-if="message.status === 'streaming'" class="message-status">
          streaming
        </span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.message-stream {
  flex: 1;
  overflow-y: auto;
  padding: 28px max(18px, calc((100% - 860px) / 2));
}

.empty-state {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 100%;
  color: var(--color-text-primary);
  text-align: center;
}

.empty-state h1 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 650;
}

.empty-state p {
  margin: 0;
  color: var(--color-text-secondary);
}

.message-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  margin: 0 auto 18px;
  width: min(100%, 860px);
}

.message-avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.message-card {
  min-width: 0;
  color: var(--color-text-primary);
  line-height: 1.65;
  white-space: pre-wrap;
}

.message-card p {
  margin: 0;
}

.message-row.user .message-card {
  justify-self: end;
  max-width: min(680px, 100%);
  padding: 10px 14px;
  border-radius: 16px;
  background: var(--color-surface-muted);
}

.message-status {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}
</style>
