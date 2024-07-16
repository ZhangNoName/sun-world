<script lang="ts" setup name="CatalogListItem">
import type { CatalogItem } from '@/type'
import { computed } from 'vue'
import { FoldSvg } from '@sun-world/icons-vue'

const prop = withDefaults(defineProps<CatalogItem>(), {
  level: 1,
  children: undefined,
  id: '',
  name: '',
  isopen: true,
})
const itemClass = computed(() => {
  return (
    'catalog-item catalog-level-' + prop.level + (prop.isopen ? ' open' : '')
  )
})
</script>

<template>
  <div :class="itemClass">
    <FoldSvg v-if="children" class="fold-icon" width="1.5rem" height="1.5rem" />
    <slot name="icon"></slot>
    <span>{{ name }}</span>
    <slot name="operate"></slot>
  </div>
  <template v-if="children">
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
  &:hover {
    background-color: var(--catalog-item-hover-bg-color);
  }
  .fold-icon {
    cursor: pointer;
    // &:hover {
    //   transform: rotate(90deg);
    //   transition: all 0.5s;
    // }
  }
}
.open {
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
