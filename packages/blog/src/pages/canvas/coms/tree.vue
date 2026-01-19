<script setup lang="ts" name="canvasTree">
import { BaseElement, EleTreeNode } from '@sun-world/editor'
import { computed, ref } from 'vue'
import TreeNode from './treeNode.vue'

const props = defineProps<{
  elements: EleTreeNode[]
}>()

// 构建元素映射表
const elementMap = computed(() => {
  const map = new Map<string, EleTreeNode>()
  props.elements.forEach((el) => {
    map.set(el.id, el)
  })
  return map
})

// 获取根元素（没有 parentId 的元素）
const rootElements = computed(() => {
  return props.elements.filter((el) => !el.parentId)
})

// 获取指定元素的子元素
const getChildren = (elementId: string): EleTreeNode[] => {
  const element = elementMap.value.get(elementId)
  if (!element || !element.children || element.children.length === 0) {
    return []
  }
  return element.children
    .map((id) => elementMap.value.get(id))
    .filter((el): el is EleTreeNode => el !== undefined)
}

// 展开/折叠状态
const expandedItems = ref<Set<string>>(new Set())

// 切换展开/折叠
const toggleExpand = (elementId: string) => {
  const children = getChildren(elementId)
  if (children.length === 0) return

  if (expandedItems.value.has(elementId)) {
    expandedItems.value.delete(elementId)
  } else {
    expandedItems.value.add(elementId)
  }
}
</script>

<template>
  <div class="canvas-tree-container">
    <TreeNode
      v-for="element in rootElements"
      :key="element.id"
      :element="element"
      :element-map="elementMap"
      :level="0"
      :expanded-items="expandedItems"
      :get-children="getChildren"
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
