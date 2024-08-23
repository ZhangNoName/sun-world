<script setup lang="ts">
import { ref } from 'vue'
import { IconProps } from '../../type'
import { DefaultProps } from '../../constant'
const props = withDefaults(defineProps<IconProps>(), DefaultProps)
</script>

<template>
  <svg
    viewBox="0 0 1024 1024"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    :width="width"
    :height="height"
    :fill="color"
  >
    <path
      d="M96 896h-6.4c-16-3.2-25.6-16-25.6-32 0-9.6-6.4-201.6 169.6-374.4 115.2-115.2 275.2-134.4 342.4-137.6V192c0-12.8 6.4-25.6 19.2-28.8s25.6-3.2 35.2 6.4l320 288c6.4 6.4 9.6 16 9.6 22.4s-3.2 19.2-9.6 22.4l-320 288c-9.6 9.6-22.4 9.6-35.2 6.4-12.8-3.2-19.2-16-19.2-28.8v-160c-51.2 0-160 9.6-240 60.8-137.6 83.2-211.2 211.2-214.4 211.2-3.2 9.6-12.8 16-25.6 16z m502.4-480c-38.4 0-208 6.4-320 118.4-70.4 70.4-108.8 147.2-128 204.8 38.4-41.6 89.6-89.6 153.6-128 124.8-76.8 297.6-70.4 307.2-67.2 16 0 32 16 32 32v121.6l240-217.6L640 262.4V384c0 9.6-3.2 16-9.6 22.4-6.4 6.4-16 9.6-22.4 9.6h-9.6z"
      p-id="19237"
    ></path>
  </svg>
</template>

<style scoped></style>
