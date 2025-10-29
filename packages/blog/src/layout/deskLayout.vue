<script setup lang="ts">
import ZHeader from './header/index.vue'
import ZFooter from './footer/index.vue'
</script>
<template>
  <div class="desk-layout">
    <ZHeader></ZHeader>

    <div class="content">
      <RouterView />
    </div>
    <div class="footer">
      <ZFooter />
    </div>
  </div>
</template>

<style scoped>
.desk-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: var(--horizontalGapPx);
  .header {
    flex: none;
  }
  .content {
    flex: 1;
  }
  .footer {
    flex: none;
  }
}
</style>
