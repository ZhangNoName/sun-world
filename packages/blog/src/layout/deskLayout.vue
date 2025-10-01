<template>
  <div class="layout">
    <header class="layout-header">
      <h1>Sun World Blog</h1>
    </header>
    <main class="layout-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
// 可根据需要添加脚本
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.layout-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: #222;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 32px;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.layout-content {
  flex: 1;
  margin-top: 64px;
  overflow-y: auto;
  padding: 24px 32px;
  background: #f5f6fa;
  min-height: 0;
}
</style>
