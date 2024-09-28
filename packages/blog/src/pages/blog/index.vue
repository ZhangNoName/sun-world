<script lang="ts" setup>
import { ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import CatalogCard from '@/components/CatalogCard/index.vue'
const prop = defineProps()
</script>

<template>
  <div class="blog-page">
    <div class="left">
      <CatalogCard />
      <SelfInfoCard />
    </div>
    <div class="right"></div>
  </div>
</template>

<style scoped>
.blog-page {
  position: relative;
  margin: 6.5rem auto 0 auto;
  height: auto;
  min-height: calc(100vh - 37rem);
  background-color: var(--bg-color);
  width: 85%;
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
  }
}
</style>
