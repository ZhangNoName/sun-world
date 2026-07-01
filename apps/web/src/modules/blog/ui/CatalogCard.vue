<script lang="ts" setup>
import { computed } from 'vue'
import type { CatalogItemType, MarkdownHeadingItem } from '@/modules/blog/types'
import CatalogItem from './CatalogItem.vue'

const prop = defineProps<{
  catalog: MarkdownHeadingItem[]
  activeId?: string
}>()

const emit = defineEmits<{
  select: [headingId: string]
}>()

// 解析目录数据并构建树形结构
const parseCatalog = (titleList: MarkdownHeadingItem[]): CatalogItemType[] => {
  const catalog: CatalogItemType[] = []
  const stack: CatalogItemType[] = [] // 用于构建树形结构

  titleList.forEach((t) => {
    const item: CatalogItemType = {
      id: t.id,
      name: t.text || '',
      level: t.level, // 获取标题级别
      children: [],
      isopen: true, // 默认展开
    }

    // 处理层级嵌套逻辑
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop() // 找到正确的父级
    }

    if (stack.length === 0) {
      catalog.push(item) // 顶级标题
    } else {
      const parent = stack[stack.length - 1] // 取栈顶元素作为父节点
      if (!parent.children) parent.children = []
      parent.children.push(item)
    }

    stack.push(item) // 当前 item 入栈，作为后续标题的可能父级
  })

  return catalog
}

const TreeDate = computed<CatalogItemType[]>(() => {
  return parseCatalog(prop.catalog)
})
</script>

<template>
  <nav class="catalog-card-container" aria-label="文章目录">
    <CatalogItem
      v-for="item in TreeDate"
      :key="item.id"
      :id="item.id"
      :name="item.name"
      :children="item.children"
      :level="item.level"
      :active-id="activeId"
      @select="emit('select', $event)"
    />
  </nav>
</template>

<style scoped>
.catalog-card-container {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  gap: var(--space-1);
  max-height: inherit;
  overflow-y: auto;
  padding-block: var(--space-1);
  border-left: 1px solid var(--border-lighter);
  scrollbar-width: thin;
}
</style>
