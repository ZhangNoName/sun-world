<script setup lang="ts">
import { ref } from 'vue'
import { IconProps } from '../../type'
import { DefaultProps } from '../../constant'
const props = withDefaults(defineProps<IconProps>(), DefaultProps)
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    :width="width"
    :height="height"
  >
    <g
      :stroke="color"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="9"></circle>
      <path
        d="M11.307 9.739 15 9l-.739 3.693a2 2 0 0 1-1.568 1.569L9 15l.739-3.693a2 2 0 0 1 1.568-1.568"
      ></path>
    </g>
  </svg>
</template>

<style scoped></style>
