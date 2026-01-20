<script setup lang="ts" name="canvasLeft">
import { BaseElement, EleTreeNode, SWEditor } from '@sun-world/editor'
import { ref, watch } from 'vue'
import CanvasTree from './coms/tree.vue'
const props = defineProps<{
  editor: SWEditor | null
}>()
const editor = props.editor
const root = ref<EleTreeNode[]>([])
watch(
  () => editor,
  (newVal) => {
    if (newVal) {
      newVal.elementTreeChanged((ele) => {
        root.value = ele
        // console.log('左侧树 ---elements',root.value.length,root.value[0], root.value)
      })
    }
  },
  { immediate: true }
)
</script>
<template>
  <div class="canvas-left-container">
    <div class="elements-container">
      <CanvasTree :elements="root" />
    </div>
  </div>
</template>
<style scoped>
.canvas-left-container {
  width: 241px;
  height: 100%;
  background: #ffffff;
}
</style>
