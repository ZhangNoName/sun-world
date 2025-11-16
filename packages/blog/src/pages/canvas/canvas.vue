<script setup lang="ts" name="canvas">
// import Editor from '@/editor/Editor.vue'
import { SWEditor } from '@sun-world/editor'
import { onMounted, ref, watchEffect } from 'vue'

const tg = window.Telegram?.WebApp
// 创建一个 canvas 的 ref
const canvasRef = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (canvasRef.value) {
    const editor = new SWEditor({
      containerElement: canvasRef.value,
    })
  }
})
</script>
<template>
  <div class="canvas-page">
    <div class="left"></div>
    <div class="canvas" ref="canvasRef"></div>
    <div class="right"></div>
  </div>
</template>
<style scoped>
.canvas-page {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  .left {
    background: #000;
    width: 241px;
  }
  .canvas {
    width: calc(100vw - 241px - 321px);
    height: calc(100vh);
  }
  .right {
    background: pink;
    width: 321px;
  }
}
</style>
