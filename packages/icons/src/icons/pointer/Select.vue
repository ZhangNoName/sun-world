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
      d="M134.485333 84.992a32 32 0 0 1 33.066667-4.949333L916.906667 398.165333a32 32 0 0 1-4.138667 60.330667l-378.453333 102.912-167.082667 354.901333a32 32 0 0 1-60.16-6.442666L123.904 116.693333a32 32 0 0 1 10.666667-31.701333z m65.877334 78.506667l148.266666 641.962666 133.973334-284.672a32 32 0 0 1 20.608-17.237333l303.616-82.56L200.362667 163.498667z"
    ></path>
  </svg>
</template>

<style scoped></style>
