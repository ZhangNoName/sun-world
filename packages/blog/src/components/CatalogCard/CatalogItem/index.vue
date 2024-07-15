<script lang="ts" setup name="CatalogListItem">
import type { CatalogItem } from '@/type'
import { computed } from 'vue'
// import CatalogListItem from './CatalogListItem.vue'

const prop = defineProps<CatalogItem>()
const itemClass = computed(() => {
  return 'catalog-item catalog-level-' + prop.level
})
</script>

<template>
  <div :class="itemClass">
    {{ name }}
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

<style lang="scss" scoped></style>
