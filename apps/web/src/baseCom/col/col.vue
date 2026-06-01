<!-- Col.vue -->
<template>
  <div :class="['col']" :style="colStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useBreakpoint } from '@/hooks/breakpoint/breakpoint'
import { computed } from 'vue'

const props = defineProps<{
  xs?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
  xxl?: number
}>()

const { screen } = useBreakpoint()

const colStyle = computed(() => {
  const span = props[screen.value] ?? 24
  return {
    gridColumn: `span ${span}`,
  }
})
</script>
