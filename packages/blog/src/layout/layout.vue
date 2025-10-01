<template>
  <div>
    <MobileLayout v-if="isMobile" />
    <WebLayout v-else />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import MobileLayout from './MobileLayout.vue'
import WebLayout from './WebLayout.vue'

const isMobile = ref(false)
import { useRoute, useRouter } from 'vue-router'
const route = useRoute()
const router = useRouter()
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
