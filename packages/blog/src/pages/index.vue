<script setup lang="ts" name="mainPage">
import ZLayoutContent from "../layout/content/index.vue";
import ZHeader from "../layout/header/index.vue";
</script>

<template>
  <div class="main-page">
    <ZHeader></ZHeader>
    <ZLayoutContent title="1"></ZLayoutContent>
  </div>
</template>

<style scoped lang="scss">
.text {
  color: red;
}

.main-page {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 50px 1fr;
  gap: 5px;
}
</style>
