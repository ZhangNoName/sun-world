<script setup lang="ts" name="RectSvg">
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
      d="M881.2 961.3H136c-42.2 0-76.5-34.3-76.5-76.5V139.5C59.5 97.3 93.8 63 136 63h745.2c42.2 0 76.5 34.3 76.5 76.5v745.2c0.1 42.2-34.3 76.6-76.5 76.6zM136 109.6c-16.5 0-29.9 13.4-29.9 29.9v745.2c0 16.5 13.4 29.9 29.9 29.9h745.2c16.5 0 29.9-13.4 29.9-29.9V139.5c0-16.5-13.4-29.9-29.9-29.9H136z"
      :fill="color"
    ></path>
  </svg>
</template>

<style scoped></style>
