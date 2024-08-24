<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const prop = defineProps({})
const route = useRoute()

onMounted(() => {
  window.location.href = `https://sunworld.site${route.path}`
})
</script>

<template>
  <div class="page-container">
    <h1>页面未找到</h1>
    <p>正在重定向...</p>
  </div>
</template>

<style scoped>
.page-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
