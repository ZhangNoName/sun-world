<template>
  <div>
    <MobileLayout v-if="isMobile" />
    <WebLayout v-else />
  </div>
</template>

<script setup lang="ts" name="SwLayout">
import { ref, onMounted } from 'vue'
import MobileLayout from './mobLayout.vue'
import WebLayout from './deskLayout.vue'

const isMobile = ref(false)

function checkIsMobile() {
  // 简单的移动端判断，可根据需要调整
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

onMounted(() => {
  isMobile.value = checkIsMobile()
})
</script>
