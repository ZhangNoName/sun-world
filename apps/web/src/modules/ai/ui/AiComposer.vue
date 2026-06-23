<script setup lang="ts">
import { ref } from 'vue'
import { SunIcon } from '@sun-world/icons/vue'
import { SunChatComposer } from '@sun-world/ui/chat-composer'

const props = defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
}>()

const text = ref('')

function submit(message: string) {
  emit('send', message)
}
</script>

<template>
  <SunChatComposer
    v-model="text"
    class="ai-composer"
    :loading="props.loading"
    placeholder="有问题，尽管问"
    submit-label="发送"
    @submit="submit"
  >
    <template #leading>
      <button class="composer-tool" type="button" aria-label="添加内容">
        <SunIcon name="plus" size="md" />
      </button>
    </template>
    <template #trailing>
      <button class="composer-tool" type="button" aria-label="语音输入">
        <SunIcon name="mic" :size="19" />
      </button>
    </template>
    <template #submit="{ loading: isLoading }">
      <SunIcon v-if="!isLoading" name="send" size="md" />
      <span v-else class="composer-loading">...</span>
    </template>
  </SunChatComposer>
</template>

<style scoped>
.ai-composer {
  --bg-component: var(--color-surface-card);
  --border-lighter: rgba(15, 23, 42, 0.1);
  max-width: min(100%, 820px);
}

.composer-tool {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
}

.composer-tool:hover,
.composer-tool:focus-visible {
  background: var(--color-surface-muted);
}

.composer-loading {
  font-size: var(--font-size-sm);
}
</style>
