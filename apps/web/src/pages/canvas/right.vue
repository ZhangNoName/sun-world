<script setup lang="ts" name="canvasRight">
import { SWEditor } from '@sun-world/editor'
import { ref, watch } from 'vue'
import { FormatPercent } from '@/util/format'
const props = defineProps<{
  editor: SWEditor | null
}>()
const editor = props.editor
const zoom = ref<number>(1)
watch(
  () => editor,
  (newVal) => {
    if (newVal) {
      newVal.onZoomChange((newVal) => {
        zoom.value = newVal
      })
    }
  },
  { immediate: true }
)
</script>
<template>
  <div class="canvas-right-container">
    <div class="zoom-container">
      <div class="zoom-label">zoom: {{ FormatPercent(zoom) }}</div>
    </div>
  </div>
</template>
<style scoped>
.canvas-right-container {
  width: 241px;
  height: 100%;
  background: #ffffff;
}
</style>
