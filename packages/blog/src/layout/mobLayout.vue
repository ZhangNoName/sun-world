<template>
  <div class="mob-layout">
    <div class="mob-header">
      <div class="left">
        <img src="/logo.svg" alt="logo" srcset="" />
      </div>
      <div class="right">
        <div class="search">搜索</div>
        <div>expend</div>
      </div>
    </div>
    <RouterView />
    <div class="mob-footer">
      <div class="bot-channel">
        <a href="/home">123</a>
        <span class="text">首页</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { RouterView } from 'vue-router'
const drawerOpen = ref(false)
function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}
</script>

<style scoped>
.mob-layout {
  position: fixed;
  bottom: 0;
  background: #f8f9fa;
  width: 100%;
  z-index: 10;
  padding-bottom: env(safe-area-inset-bottom);
  .mob-footer {
    display: flex;
    .bot-channel {
      flex-grow: 1;
      height: 48px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      a {
      }
      .text {
      }
    }
  }
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
</style>
