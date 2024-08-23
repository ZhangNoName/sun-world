<script setup lang="ts">
  import { ref } from 'vue'
  // 定义组件的 props
  const props = defineProps<{
    tag: string | number
    url?: string
    color?: string
  }>()

  const color = ref(props.color || 'yellow')
</script>

<template>
  <a :href="url" target="_blank" :style="{ backgroundColor: color }">
    {{ tag }}
  </a>
</template>

<style scoped>
  a {
    border-radius: 0.2rem;
    width: auto;
    height: 100%;
    padding: 0 1rem;
    display: flex;
    justify-content: center;
    align-items: center;
    text-decoration: none;
  }
</style>
