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
  margin: 16px 0;
}
.load-more-btn {
  padding: 8px 24px;
  border: none;
  background: #409eff;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
}
.load-more-btn:hover {
  background: #66b1ff;
}
.load-more-loading,
.load-more-finished {
  color: #888;
  font-size: 14px;
}
</style>
