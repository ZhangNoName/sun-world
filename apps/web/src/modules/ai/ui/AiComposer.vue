<script setup lang="ts">
import { ref } from 'vue'
import { SunChatComposer } from '@sun-world/ui/chat-composer'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'

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
        <SvgIcon name="plus" size="18" />
      </button>
    </template>
    <template #trailing>
      <button class="composer-tool" type="button" aria-label="语音输入">
        <SvgIcon name="ai-voice" size="19" />
      </button>
    </template>
    <template #submit="{ loading: isLoading }">
      <SvgIcon v-if="!isLoading" name="ai-send" size="18" />
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
