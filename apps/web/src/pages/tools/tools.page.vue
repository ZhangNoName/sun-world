<script lang="ts" setup name="ToolsPage">
import { ref } from 'vue'

const prop = defineProps({})
const source = Array(50)
  .fill(0)
  .map((_, index) => index + 1)
</script>

<template>
  <div class="tool-page">
    <div class="tool-card" v-for="(i, index) in source" :key="index">
      Card {{ i }}
    </div>
  </div>
</template>

<style scoped>
.tool-page {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  .tool-card {
    width: 200px;
    aspect-ratio: 1 / 1;
    background-color: red;
    flex-shrink: 0;
  }
}
</style>
