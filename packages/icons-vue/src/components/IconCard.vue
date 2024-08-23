<script setup lang="ts" name="ZIconCard">
import { computed, markRaw, shallowRef, watchEffect } from "vue";
// 定义组件的 props
const props = defineProps<{
  icon: object;
}>();
</script>

<template>
  <div className="z-icon-card-container"><component :is="props.icon" /></div>
</template>

<style scoped lang="scss">
.z-icon-card-container {
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid #333;
  border-radius: 10px;
  &:hover {
    background-color: aquamarine;
  }
}
</style>
