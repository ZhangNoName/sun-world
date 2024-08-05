<script lang="ts" setup>
import { ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import CatalogCard from '@/components/CatalogCard/index.vue'
import ZFooter from '@/layout/footer/index.vue'
const prop = defineProps()
</script>

<template>
  <div class="blog-content">
    <div class="left">
      <CatalogCard />
      <SelfInfoCard />
    </div>
    <div class="right"></div>
  </div>
  <ZFooter />
</template>

<style lang="scss" scoped>
.blog-content {
  display: grid;
  grid-template-columns: 35rem auto;
  grid-template-rows: auto;
  gap: 1rem;
  .left {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .right {
    // background-color: blue;
  }
}
</style>
