<script setup lang="ts" name="AddOutlined">
import { ref } from "vue";
// 定义组件的 props
const props = defineProps<{
  width?: number;
  height?: number;
  color?: string;
}>();

// 默认宽高
const defaultWidth = ref(props.width || 24);
const defaultHeight = ref(props.height || 24);
const color = ref(props.color || "#333");
</script>

<template>
  <svg
    :width="defaultWidth"
    :height="defaultHeight"
    viewBox="0 0 24 24"
    :fill="color"
    xmlns="http://www.w3.org/2000/svg"
    class="icon"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M11 12V17H12V12H17V11H12V6H11V11H6V12H11Z"
    />
  </svg>
</template>

<style scoped></style>
