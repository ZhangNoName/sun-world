<script lang="ts" setup>
import { ref } from 'vue'
</script>

<template>
  <div class="manage-blog">
    <div class="top"></div>
    <div class="mid"></div>
    <div class="bootom"></div>
  </div>
</template>

<style scoped>
.manage-blog {
  height: 100%;

  display: grid;
  grid-template-columns: 25rem 2.5rem auto;
  grid-template-rows: auto;
  gap: 1rem;
}
</style>
