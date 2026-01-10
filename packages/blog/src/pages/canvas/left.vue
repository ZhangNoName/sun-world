<script setup lang="ts" name="canvasLeft">
import { BaseElement, SWEditor } from '@sun-world/editor'
import { ref, watch } from 'vue'
const props = defineProps<{
  editor: SWEditor
}>()
const editor = props.editor
const elements = ref<BaseElement[]>([])
watch(
  editor,
  (newVal) => {
    newVal?.elementStoreChanged((ele) => {
      elements.value = ele
      console.log('elements', elements.value)
    })
  },
  { immediate: true }
)
</script>
<template>
  <div class="canvas-left-container">
    <div class="elements-container">
      <div class="element" v-for="element in elements" :key="element.id">
        <div class="element-name">{{ element.name }}</div>
      </div>
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
