<template>
  <div class="mob-layout">
    <!-- Header -->
    <header class="mob-header">
      <div class="logo">Sun World</div>
      <button class="menu-btn" @click="toggleDrawer">
        <span class="icon">&#9776;</span>
      </button>
    </header>

    <!-- Side Drawer -->
    <transition name="slide">
      <nav class="mob-drawer" v-if="drawerOpen" @click.self="toggleDrawer">
        <ul>
          <li><a href="#home" @click="toggleDrawer">首页</a></li>
          <li><a href="#about" @click="toggleDrawer">关于我</a></li>
          <li><a href="#blog" @click="toggleDrawer">博客</a></li>
          <li><a href="#contact" @click="toggleDrawer">联系</a></li>
        </ul>
      </nav>
    </transition>

    <!-- Main Content -->
    <main class="mob-main">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="mob-footer">
      &copy; {{ new Date().getFullYear() }} Sun World. 保留所有权利.
    </footer>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const drawerOpen = ref(false)
function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}
</script>

<style scoped>
.mob-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f8f9fa;
}

.mob-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background: #222;
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}

.logo {
  font-size: 1.2rem;
  font-weight: bold;
}

.menu-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 2rem;
  cursor: pointer;
}

.mob-drawer {
  position: fixed;
  top: 0;
  left: 0;
  width: 70vw;
  max-width: 260px;
  height: 100vh;
  background: #fff;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  padding-top: 56px;
}

.mob-drawer ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mob-drawer li {
  border-bottom: 1px solid #eee;
}

.mob-drawer a {
  display: block;
  padding: 16px;
  color: #222;
  text-decoration: none;
  font-size: 1.1rem;
}

.mob-drawer a:hover {
  background: #f0f0f0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}

.mob-main {
  flex: 1;
  padding: 16px;
  background: #f8f9fa;
}

.mob-footer {
  text-align: center;
  padding: 12px 0;
  background: #222;
  color: #fff;
  font-size: 0.95rem;
}
</style>
