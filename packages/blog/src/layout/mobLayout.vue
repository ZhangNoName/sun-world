<template>
  <div class="mob-layout">
    <div class="mob-header">
      <div class="left">
        <SvgIcon name="logo" alt="logo" />
      </div>
      <div class="right">
        <div class="search">搜索</div>
        <div>expend</div>
      </div>
    </div>
    <div class="main-container" id="mf">
      <RouterView v-slot="{ Component, route }">
        <keep-alive>
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </RouterView>
    </div>

    <div class="mob-footer">
      <div class="bot-channel">
        <router-link to="/home" class="bot-channel">
          <SvgIcon name="home" alt="home" />
          <span class="text">首页</span>
        </router-link>
      </div>
      <div class="bot-channel">
        <router-link to="/aigc" class="bot-channel">
          <SvgIcon name="ai" alt="ai" />
          <span class="text">AI</span>
        </router-link>
      </div>
      <div class="bot-channel">
        <router-link to="/canvas" class="bot-channel">
          <SvgIcon name="canvas" alt="canvas" />
          <span class="text">画布</span>
        </router-link>
      </div>
      <div class="bot-channel">
        <router-link to="/me" class="bot-channel">
          <SvgIcon name="me" alt="me" />
          <span class="text">个人中心</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import SvgIcon from '@/components/SvgIcon/svgIcon.vue'
import { ref } from 'vue'
import { RouterView } from 'vue-router'
const drawerOpen = ref(false)
function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}
</script>

<style scoped>
.mob-layout {
  height: 100dvh;
  position: fixed;
  bottom: 0;
  background: var(--bg-page);
  width: 100%;
  z-index: 10;
  padding-bottom: env(safe-area-inset-bottom);
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .mob-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
    padding: 0 16px 0 12px;
    color: #fff;
    top: 0;
    flex-shrink: 0;
  }
  .main-container {
    padding: 0 var(--horizontalGapPx);
    flex: auto;
    overflow: auto;
  }
  .mob-footer {
    flex-shrink: 0;
    display: flex;
    .bot-channel {
      flex-grow: 1;
      height: 48px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      @media screen and (max-width: 695px) {
        .text {
          display: none;
        }
      }
      a {
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .text {
      }
    }
  }
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
