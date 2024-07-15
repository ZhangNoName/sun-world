<script lang="ts" setup>
import { ref } from 'vue'
import { CatalogListData } from './index.data'
import CatalogItem from './CatalogItem/index.vue'

const prop = defineProps()
</script>

<template>
  <div class="catalog-card-container">
    <CatalogItem
      v-for="item in CatalogListData"
      :key="item.id"
      :id="item.id"
      :name="item.name"
      :children="item.children"
      :level="item.level"
    />
  </div>
</template>

<style lang="scss" scoped>
.catalog-card-container {
}
</style>
