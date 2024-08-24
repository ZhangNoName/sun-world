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
      d="M1004.859394 1023.997931a34.48385 34.48385 0 0 1-24.483534-10.000317L693.297808 726.919562A34.48385 34.48385 0 0 1 741.402779 678.124914L1029.170508 965.547805a34.48385 34.48385 0 0 1 0 48.794648 34.48385 34.48385 0 0 1-24.311114 9.655478z"
      :fill="color"
    ></path>
    <path
      d="M424.151357 847.957876a423.978938 423.978938 0 1 1 424.151357-423.978938 424.668615 424.668615 0 0 1-424.151357 423.978938zM424.151357 51.725775a372.253163 372.253163 0 1 0 372.425582 372.253163A372.77042 372.77042 0 0 0 424.151357 51.725775z"
      :fill="color"
      p-id="5314"
    ></path>
  </svg>
</template>

<style scoped></style>
