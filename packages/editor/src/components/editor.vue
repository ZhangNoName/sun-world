<script setup lang="ts" name="sw-editor">
// import Editor from '@/editor/Editor.vue'
import { SWEditor } from '../editor.ts'
import { ref, watchEffect } from 'vue'

// 创建一个 canvas 的 ref
const canvasRef = ref<HTMLCanvasElement | null>(null)

const containerRef = ref<HTMLDivElement | null>(null)

watchEffect(() => {
  if (canvasRef.value && containerRef.value) {
    const editor = new SWEditor({
      containerElement: containerRef.value!,
      width: document.body.clientWidth,
      height: document.body.clientHeight,
    })
  }
})
</script>
<template>
  <div class="canvas-page" ref="containerRef">
    <canvas ref="canvasRef" />
  </div>
</template>
<style scoped>
.canvas-page {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  input {
    height: 50px;
  }
}
</style>
