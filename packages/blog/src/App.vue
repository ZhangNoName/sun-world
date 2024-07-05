<script setup lang="ts" name="APP">
import MainPage from "./pages/index.vue";
import { computed, ref } from "vue";
const theme = ref("sun-light");

const allClass = computed(() => {
  return "app-container " + theme.value;
});
</script>

<template>
  <div :class="allClass">
    <MainPage />
  </div>
</template>

<style scoped lang="scss">
.app-container {
  width: 100%;
  height: 100%;
  font-size: 1.6rem;
  color: var(--font-color);
  background-color: var(--background-color);
}
</style>
