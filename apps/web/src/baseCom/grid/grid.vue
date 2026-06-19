<template>
  <div class="grid" :style="gridStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  gap?: number
  columns?: number
}>()

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: `repeat(${props.columns ?? 24}, 1fr)`,
  gap: `${props.gap ?? 8}px`,
}
</script>

<style scoped>
.grid {
  width: 100%;
}
</style>
