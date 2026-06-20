<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
}>()

const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const canSend = computed(() => text.value.trim().length > 0 && !props.loading)

function resize() {
  const target = textareaRef.value
  if (!target) return
  target.style.height = 'auto'
  target.style.height = `${Math.min(target.scrollHeight, 180)}px`
}

function submit() {
  if (!canSend.value) return
  emit('send', text.value)
  text.value = ''
  requestAnimationFrame(resize)
}
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      ref="textareaRef"
      v-model="text"
      class="composer-textarea"
      rows="1"
      placeholder="Message Sun World AI"
      @input="resize"
      @keydown.enter.exact.prevent="submit"
    ></textarea>
    <button class="composer-send" type="submit" :disabled="!canSend">
      {{ loading ? '...' : 'Send' }}
    </button>
    <p class="composer-hint">Enter to send. Shift+Enter for a new line.</p>
  </form>
</template>

<style scoped>
.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  width: min(100%, 860px);
  padding: 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 18px;
  background: var(--color-surface-card);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.composer-textarea {
  min-height: 28px;
  max-height: 180px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  line-height: 1.5;
}

.composer-send {
  align-self: end;
  min-width: 68px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: var(--color-primary);
  color: var(--btn-text-color);
  cursor: pointer;
}

.composer-send:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.composer-hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}
</style>
