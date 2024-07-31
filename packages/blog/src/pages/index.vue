<script setup lang="ts">
import ZHeader from '@/layout/header/index.vue'
import ZFooter from '@/layout/footer/index.vue'
import { RouterView } from 'vue-router'

import { onMounted } from 'vue'

onMounted(() => {
  console.log('mounted')
})
</script>

<template>
  <div class="main-page">
    <ZHeader></ZHeader>
    <div class="z-content">
      <RouterView />
    </div>
    <ZFooter></ZFooter>
  </div>
</template>

<style scoped lang="scss">
.text {
  color: red;
}

.main-page {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  // background-color: antiquewhite;
  .z-header {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 10;
  }
  .z-content {
    position: relative;
    margin-top: 6.5rem;
    margin: 6.5rem auto 0 auto;
    height: auto;
    min-height: calc(100vh - 37rem);
    background-color: none;
    width: 85%;
  }
  .z-footer {
    margin-top: 1.5rem;
    // position: absolute;
    bottom: 0;
    width: 100%;
  }
}
</style>
