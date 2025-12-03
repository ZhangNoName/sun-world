<script setup lang="ts" name="canvas">
// import Editor from '@/editor/Editor.vue'
import { Delete } from '@element-plus/icons-vue'
import { SWEditor, ToolName } from '@sun-world/editor'

import { CommentSvg, HandSvg, RectSvg, SelectSvg } from '@sun-world/icons'
import { onMounted, reactive, ref, watchEffect } from 'vue'

const tg = window.Telegram?.WebApp
// 创建一个 canvas 的 ref
const canvasRef = ref<HTMLDivElement | null>(null)
const tools = ref<string[]>([])
const editor = ref<SWEditor | null>(null)
const selectToolHandle = (tool: ToolName) => {
  editor.value?.setTool(tool)
}
onMounted(() => {
  if (canvasRef.value) {
    editor.value = new SWEditor({
      containerElement: canvasRef.value,
    })

    // tools.value = [...editor.getTools()]
    tools.value = ['1', '2', '3', '4']
    ;(window as any).sw = editor
  }
})
</script>
<template>
  <div class="canvas-page">
    <!-- <div class="left"></div> -->
    <div class="canvas" ref="canvasRef"></div>
    <!-- <div class="right"></div> -->
    <div class="tools-container">
      <div class="tool active">
        <SelectSvg
          color="#fff"
          width="24px"
          height="24px"
          @click="() => selectToolHandle('select')"
        />
      </div>
      <div class="tool">
        <HandSvg
          width="24px"
          height="24px"
          @click="() => selectToolHandle('drag')"
        />
      </div>
      <div class="tool">
        <CommentSvg
          width="24px"
          height="24px"
          @click="() => selectToolHandle('comment')"
        />
      </div>
      <div class="tool">
        <RectSvg
          width="24px"
          height="24px"
          @click="() => selectToolHandle('rect')"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.canvas-page {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
  .left {
    background: #000;
    width: 241px;
  }
  .canvas {
    width: 100vw;
    /* width: calc(100vw - 241px - 321px); */
    height: calc(100vh);
  }
  .right {
    background: pink;
    width: 321px;
  }
  .tools-container {
    z-index: 10;
    bottom: 12px;
    border-radius: 13px;
    padding: 8px;
    height: 48px;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: fit-content;

    background-color: red;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    background-color: #ffffff;
    .tool {
      color: white;
      padding: 4px;
      border-radius: 5px;
      aspect-ratio: 1 / 1;
      svg {
        display: block;

        /* height: 24px; */
      }
    }
    .active {
      background-color: #0d99ff;
    }
  }
}
</style>
