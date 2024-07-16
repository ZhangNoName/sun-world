<script lang="ts" setup name="CatalogListItem">
import type { CatalogItem } from '@/type'
import { computed } from 'vue'
import { FoldSvg } from '@sun-world/icons-vue'
// import CatalogListItem from './CatalogListItem.vue'

const prop = defineProps<CatalogItem>()
const itemClass = computed(() => {
  return 'catalog-item catalog-level-' + prop.level
})
</script>

<template>
  <div :class="itemClass">
    <FoldSvg width="1.5rem" height="1.5rem" />
    <slot name="icon"></slot>
    {{ name }}
    <slot name="operate"></slot>
  </div>
  <template v-if="children">
    <CatalogListItem
      v-for="item in children"
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
  gap: 1rem;
}
@for $i from 1 through 10 {
  .catalog-level-#{$i} {
    margin-left: #{2rem * $i};
  }
}
</style>
