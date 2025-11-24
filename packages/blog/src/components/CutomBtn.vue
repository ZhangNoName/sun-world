<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>

<template>
  <button class="custom-button">
    <slot></slot>
  </button>
</template>

<style scoped>
.custom-button {
  padding: 10px 20px;
  background-color: #42b983;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
}
</style>
