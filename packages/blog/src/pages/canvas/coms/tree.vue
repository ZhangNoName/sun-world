<script setup lang="ts" name="canvasTree">
import { BaseElement, EleTreeNode } from '@sun-world/editor'
import { computed, ref } from 'vue'
import TreeNode from './treeNode.vue'

const props = defineProps<{
  elements: EleTreeNode[]
}>()


// 展开/折叠状态
const expandedItems = ref<Set<string>>(new Set())

// 切换展开/折叠
const toggleExpand = (elementId: string) => {
 
}
</script>

<template>
  <div class="canvas-tree-container">
    <TreeNode
      v-for="element in props.elements"
      :key="element.id"
      :element="element"
      :level="0"
      :expanded-items="expandedItems"
      @toggle-expand="toggleExpand"
    />
  </div>
</template>

<style scoped>
.canvas-tree-container {
  width: 100%;
  height: 100%;
  background: #ffffff;
  overflow-y: auto;
  padding: 8px;
}
</style>
