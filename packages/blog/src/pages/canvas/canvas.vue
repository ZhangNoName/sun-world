<script setup lang="ts" name="canvas">
// import Editor from '@/editor/Editor.vue'
import { FormatPercent } from '@/util/format'
import { Delete } from '@element-plus/icons-vue'
import { SWEditor, type ToolName } from '@sun-world/editor'
import { CommentSvg, HandSvg, RectSvg, SelectSvg } from '@sun-world/icons'
import { onMounted, reactive, ref, watch, watchEffect } from 'vue'

const tg = window.Telegram?.WebApp
// 创建一个 canvas 的 ref
const canvasRef = ref<HTMLDivElement | null>(null)
const tools = ref<string[]>([])
const editor = ref<SWEditor | null>(null)
const activeTool = ref<ToolName | null>(null)
const selectToolHandle = (tool: ToolName) => {
  editor.value?.setTool(tool)
}
const zoom = ref<number>(1)

onMounted(() => {
  if (canvasRef.value) {
    editor.value = new SWEditor({
      containerElement: canvasRef.value,
    })
    activeTool.value = editor.value?.getActiveToolName() || null
    // tools.value = [...editor.getTools()]
    tools.value = ['1', '2', '3', '4']
    editor.value.toolChanged(() => {
      activeTool.value = editor.value?.getActiveToolName() || null
    })
    zoom.value = editor.value?.zoom || 1
    editor.value?.onZoomChange((newVal) => {
      // console.log('newVal', newVal)
      zoom.value = newVal
    })
    ;(window as any).sw = editor
  }
})
</script>
<template>
  <div class="canvas-page">
    <div class="left"></div>
    <div class="canvas" ref="canvasRef"></div>
    <div class="right">
      <div class="right-top">
        <div class="label">zoom: {{ FormatPercent(zoom) }}</div>
      </div>
    </div>
    <div class="tools-container">
      <div class="tool" :class="{ active: activeTool === 'select' }">
        <SelectSvg
          width="24px"
          height="24px"
          @click="() => selectToolHandle('select')"
        />
      </div>
      <div class="tool" :class="{ active: activeTool === 'drag' }">
        <HandSvg
          width="24px"
          height="24px"
          @click="() => selectToolHandle('drag')"
        />
      </div>
      <div class="tool" :class="{ active: activeTool === 'comment' }">
        <CommentSvg
          width="24px"
          height="24px"
          @click="() => selectToolHandle('comment')"
        />
      </div>
      <div class="tool" :class="{ active: activeTool === 'rect' }">
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
  --left-width: 241px;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
  .left {
    background: #ffffff;
    width: var(--left-width);
    flex-shrink: 0;
  }
  .canvas {
    width: 100vw;
    /* width: calc(100vw - 241px - 321px); */
    height: calc(100vh);
  }
  .right {
    background: #ffffff;
    width: var(--left-width);
    flex-shrink: 0;
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
      cursor: pointer;
      svg {
        display: block;

        /* height: 24px; */
      }
    }
    .active {
      background-color: #0d99ff;
      svg {
        fill: white;
      }
    }
  }
}
</style>
