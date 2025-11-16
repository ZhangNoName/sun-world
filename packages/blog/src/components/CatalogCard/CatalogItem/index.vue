<script lang="ts" setup name="CatalogListItem">
import type { CatalogItemType } from '@/type'
import { computed, ref } from 'vue'
import { FoldSvg } from '@sun-world/icons'

const prop = withDefaults(defineProps<CatalogItemType>(), {
  level: 1,
  children: undefined,
  id: '',
  name: '',
  isopen: true,
})
const domRef = ref()
const isOpen = ref(prop.isopen)
const itemClass = computed(() => {
  return (
    'catalog-item catalog-level-' + prop.level + (isOpen.value ? ' open' : '')
  )
})
const changeOpen = () => {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div :class="itemClass">
    <FoldSvg
      v-if="children && children.length"
      @click="changeOpen"
      class="fold-icon"
      width="1.5rem"
      height="1.5rem"
    />
    <slot name="icon"></slot>
    <span>{{ name }}</span>
    <slot name="operate"></slot>
  </div>
  <template v-if="children && isOpen">
    <CatalogListItem
      v-for="item in children"
      :isopen="item.isopen"
      :key="item.id"
      :name="item.name"
      :level="item.level"
      :children="item.children"
      :id="item.id"
    />
  </template>
</template>
<script lang="ts">
import CatalogListItem from './index.vue'
</script>

<style scoped>
.catalog-item {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--bg-page);

  /* 禁止用户选中文本 */
  user-select: none; /* 标准语法 */
  -webkit-user-select: none; /* 针对 Webkit (Safari, Chrome) 浏览器 */
  -moz-user-select: none; /* 针对 Mozilla (Firefox) 浏览器 */
  -ms-user-select: none; /* 针对 IE10+ 浏览器 */
  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-hover);
  }
  .fold-icon {
    cursor: pointer;

    &:hover {
      color: var(--bg-page-hover) !important;
    }
  }
}
.open {
  .fold-icon {
    transform: rotate(90deg);
  }
}
.catalog-level-1 {
  margin-left: 2rem;
}
.catalog-level-2 {
  margin-left: 4rem;
}
.catalog-level-3 {
  margin-left: 6rem;
}
.catalog-level-4 {
  margin-left: 8rem;
}
.catalog-level-5 {
  margin-left: 10rem;
}
</style>
