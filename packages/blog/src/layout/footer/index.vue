<script setup lang="ts" name="ZFooter">
import { ref } from "vue";

const count = ref(0);
</script>

<template>
  <div class="z-footer">
    <div class="z-footer-content"></div>
  </div>
</template>

<style scoped>
.z-footer {
  background-color: white;
  height: 20rem;
  width: 100%;
  /* padding: 3rem 1.5rem 6rem 1.5rem; */
  padding: 3rem 0 6rem 0;
  .z-footer-content {
    margin: 0 auto;
    height: 100%;
    width: 85%;
    background-color: aquamarine;
  }
}
</style>
