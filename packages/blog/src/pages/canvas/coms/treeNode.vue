<script setup lang="ts">
import { BaseElement, EleTreeNode } from '@sun-world/editor'
import { computed } from 'vue'
import EleIcon from './icon.vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
const props = defineProps<{
  element: EleTreeNode
  level: number
  expandedItems: Set<string>
}>()

const emit = defineEmits<{
  toggleExpand: [id: string]
}>()

const hasChildren = computed(() => props.element.children && props.element.children.length > 0)
// const isExpanded = computed(() => props.expandedItems.has(props.element.id))
const isExpanded = true

const toggleExpand = () => {
  if (hasChildren.value) {
    emit('toggleExpand', props.element.id)
  }
}
</script>

<template>
  <div class="tree-node">
    <div
      class="tree-item"
      :style="{ paddingLeft: level * 16 + 'px' }"
      :class="{ 'has-children': hasChildren, expanded: isExpanded }"
    >
      <span
        v-if="hasChildren"
        class="tree-expand-icon"
        @click.stop="toggleExpand"
      >
        <SvgIcon name="editor-expand" size="10px" />
      </span>
      <span v-else class="tree-expand-placeholder"></span>
      <div class="icon">
        <EleIcon :type="element.type" />
      </div>
      <span class="tree-item-name" @click.stop="toggleExpand">
        {{ element.name || element.type }}
      </span>
    </div>
    <div  class="tree-children">
      <TreeNode
        v-for="child in element.children"
        :key="child.id"
        :element="child"
        :level="level + 1"
        :expanded-items="expandedItems"
        @toggle-expand="emit('toggleExpand', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  width: 100%;
}

.tree-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
  border-radius: 4px;
  .icon {
    margin: 0 5px;
  }
}

.tree-item:hover {
  background-color: #f5f5f5;
}

.tree-item.has-children {
  font-weight: 500;
}

.tree-expand-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 10px;
  color: #666;
  margin-right: 4px;
  flex-shrink: 0;
}

.tree-expand-placeholder {
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 4px;
  flex-shrink: 0;
}

.tree-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: #333;
}

.tree-children {
  width: 100%;
}
</style>
