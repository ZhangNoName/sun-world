<template>
  <div>
    <MobileLayout v-if="isMobile" />
    <WebLayout v-else />
  </div>
</template>

<script setup lang="ts" name="SwLayout">
import { ref, onMounted, onUnmounted } from 'vue'
import MobileLayout from './mobLayout.vue'
import WebLayout from './deskLayout.vue'
import { useDeviceStore } from '@/store/tg'
const { isMobile, registerResizeListener } = useDeviceStore()
registerResizeListener(onMounted, onUnmounted)
onMounted(() => {
  console.log('Layout Mounted - isMobile:', isMobile)
})
</script>
