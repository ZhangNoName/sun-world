<script lang="ts" setup>
  import { ref } from 'vue'

  const prop = defineProps()

  import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
</script>

<template>
  <div class="blog-content">
    <div class="left">
      <SelfInfoCard />
    </div>
    <div class="right"></div>
  </div>
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
