<script setup lang="ts" name="canvas">
import Editor from '@/editor/Editor.vue'

const tg = window.Telegram?.WebApp
</script>
<template>
  <div class="canvas-page">
    <Editor />
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
