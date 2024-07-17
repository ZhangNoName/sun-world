<script lang="ts" setup name="CatalogListItem">
import type { CatalogItem } from '@/type'
import { computed, ref } from 'vue'
import { FoldSvg } from '@sun-world/icons-vue'

const prop = withDefaults(defineProps<CatalogItem>(), {
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
      v-if="children"
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

<style lang="scss" scoped>
.catalog-item {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--catalog-item-bg-color);

  // 禁止用户选中文本
  user-select: none; /* 标准语法 */
  -webkit-user-select: none; /* 针对 Webkit (Safari, Chrome) 浏览器 */
  -moz-user-select: none; /* 针对 Mozilla (Firefox) 浏览器 */
  -ms-user-select: none; /* 针对 IE10+ 浏览器 */
  &:hover {
    background-color: var(--catalog-item-hover-bg-color);
    color: var(--catalog-item-hover-color);
  }
  .fold-icon {
    cursor: pointer;

    &:hover {
      color: var(--catalog-item-hover-color) !important;
    }
  }
}
.open {
  // .catalog-item {
  //   display: none;
  // }
  .fold-icon {
    transform: rotate(90deg);
    // transition: all 0.5s;
  }
}
@for $i from 1 through 10 {
  .catalog-level-#{$i} {
    margin-left: #{2rem * $i};
  }
}
</style>
