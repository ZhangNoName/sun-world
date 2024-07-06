<script setup lang="ts" name="mainPage">
import ZLayoutContent from "@/layout/content/index.vue";
import ZHeader from "@/layout/header/index.vue";
import ZFooter from "@/layout/footer/index.vue";
</script>

<template>
  <div class="main-page">
    <ZHeader></ZHeader>
    <ZLayoutContent title="1"></ZLayoutContent>
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
  // display: grid;
  // grid-template-rows: 5rem 1fr 15rem;
  // gap: 5px;
  background-color: antiquewhite;
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
    height: auto;
    min-height: calc(100vh - 35.5rem);
  }
  .z-footer {
    // margin-top: 1.5rem;
    // position: absolute;
    bottom: 0;
    width: 100%;
  }
}
</style>
