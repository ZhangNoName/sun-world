<script setup lang="ts" name="sw-editor">
// import Editor from '@/editor/Editor.vue'
import { SWEditor } from '../editor.ts'
import { ref, watchEffect } from 'vue'

// 创建一个 canvas 的 ref
const canvasRef = ref<HTMLCanvasElement | null>(null)

watchEffect(() => {
  if (canvasRef.value) {
    const editor = new SWEditor({
      : canvasRef.value!,
      width: document.body.clientWidth,
      height: document.body.clientHeight,
    })
  }
})
</script>
<template>
  <div class="canvas-page">
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
