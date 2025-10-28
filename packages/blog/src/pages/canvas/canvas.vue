<script setup lang="ts" name="canvas">
const tg = window.Telegram?.WebApp
</script>
<template>
  <div class="canvas-page">
    <input type="text" />
  </div>
</template>
<style scoped>
.canvas-page {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  input {
    height: 50px;
  }
}
</style>
