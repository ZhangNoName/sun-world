<script lang="ts" setup>
import { ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import ZHeader from '@/layout/header/index.vue'
const prop = defineProps()
</script>

<template>
  <div class="article-page page-container">
    <ZHeader></ZHeader>

    <div class="content">
      <div class="left">
        <SelfInfoCard />
      </div>
      <div class="right">
        <div></div>
      </div>
    </div>
    <ZFooter />
  </div>
</template>

<style lang="scss" scoped>
@import '../constant.scss';
.article-page {
  .content {
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
}
</style>
