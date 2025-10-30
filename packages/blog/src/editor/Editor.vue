<template>
  <div class="editor-container">
    <div class="toolbar">
      <button @click="switchEngine('pixi')">Pixi</button>
      <button @click="switchEngine('canvas')">Canvas</button>
    </div>
    <canvas ref="canvasRef" class="editor-canvas"></canvas>
  </div>
</template>

<script setup lang="ts" name="Editor">
import { ref, onMounted } from 'vue'
// import { PixiEngine } from './engines/pixiEngine'
import { CanvasEngine } from './engines/canvasEngine'
import { CanvasEditor } from '@/types/editor.type'

const canvasRef = ref<HTMLCanvasElement>()
let engine: CanvasEditor

function switchEngine(type: 'pixi' | 'canvas') {
  engine?.destroy()
  if (type === 'pixi') engine = new CanvasEngine()
  else engine = new CanvasEngine()
  engine.init(canvasRef.value!)
}

onMounted(() => {
  switchEngine('pixi') // 默认启动
})
</script>

<style scoped>
.editor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.editor-canvas {
  flex: 1;
  border: 1px solid #ddd;
}
</style>
