<template>
  <div class="load-more">
    <button
      v-if="!finished && !loading"
      @click="loadMore"
      class="load-more-btn"
    >
      加载更多
    </button>
    <div v-else-if="loading" class="load-more-loading">加载中...</div>
    <div v-else class="load-more-finished">已全部加载</div>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits } from 'vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  finished: { type: Boolean, default: false },
})

const emit = defineEmits(['load'])

function loadMore() {
  emit('load')
}
</script>

<style scoped>
.load-more {
  text-align: center;
  margin: var(--space-4) 0;
}
.load-more-btn {
  padding: var(--space-2) var(--space-6);
  border: none;
  background: var(--color-brand);
  color: var(--btn-text-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-md);
}
.load-more-btn:hover {
  background: var(--color-brand-light);
}
.load-more-loading,
.load-more-finished {
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}
</style>
