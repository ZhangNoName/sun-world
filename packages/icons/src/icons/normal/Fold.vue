<script setup lang="ts">
import { IconProps } from '../../type'
import { DefaultProps } from '../../constant'
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
  >
    <path
      d="M676.1 512L232.3 116.1l57.9-51.7L791.7 512 290.2 959.6l-57.9-51.7L676.1 512z"
      :fill="color"
    ></path>
  </svg>
</template>

<style scoped></style>
