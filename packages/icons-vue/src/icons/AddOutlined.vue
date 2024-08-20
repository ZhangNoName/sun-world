<script setup lang="ts">
import { IconProps } from '../type'
import { DefaultProps } from '@/constant'
// 定义组件的 props
const props = withDefaults(defineProps<IconProps>(), DefaultProps)
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 1039 1024"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    :width="width"
    :height="height"
    :fill="color"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M11 12V17H12V12H17V11H12V6H11V11H6V12H11Z"
    />
  </svg>
</template>

<style scoped></style>
