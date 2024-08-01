<script setup lang="ts">
import { IconProps } from '../../type'
import { DefaultProps } from '../../constant'
const props = withDefaults(defineProps<IconProps>(), DefaultProps)
</script>

<template>
  <svg
    viewBox="0 0 1024 1024"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    p-id="8095"
    :width="width"
    :height="height"
  >
    <path
      d="M512 70.4a441.6 441.6 0 1 0 0 883.2 441.6 441.6 0 0 0 0-883.2z m0 64a377.6 377.6 0 1 1 0 755.2 377.6 377.6 0 0 1 0-755.2z"
      :fill="color"
    ></path>
    <path
      d="M544 480V256a32 32 0 1 0-64 0v230.4c0 31.7952 25.8048 57.6 57.6 57.6H768a32 32 0 1 0 0-64h-224z"
      :fill="color"
    ></path>
  </svg>
</template>

<style scoped></style>
