<template>
  <MobileLayout v-if="isMobile" />
  <WebLayout v-else />
</template>

<script setup lang="ts" name="SwLayout">
import { ref, onMounted, onUnmounted } from 'vue'
import MobileLayout from './mobLayout.vue'
import WebLayout from './deskLayout.vue'
import { useDeviceStore } from '@/store/tg'
import { storeToRefs } from 'pinia'
const store = useDeviceStore()

// 🌟 关键修复：使用 storeToRefs 来解构响应式状态
const { isMobile } = storeToRefs(store)
const { registerResizeListener } = store // 动作 (Actions) 可以直接解构
registerResizeListener(onMounted, onUnmounted)
// onMounted(() => {
//   window.addEventListener('resize', store.handleResize)
// })
// onUnmounted(() => {
//   window.removeEventListener('resize', store.handleResize)
// })
</script>
