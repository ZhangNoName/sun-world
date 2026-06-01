<template>
  <div class="mob-layout">
    <div class="mob-header">
      <div class="left">
        <img src="/logo.svg" alt="logo" srcset="" width="40px" height="40px" />
      </div>
      <div class="right">
        <Btn icon="search" @click="toggleDrawer" type="icon" />
        <Btn icon="menu" @click="toggleDrawer" type="icon" />
      </div>
    </div>
    <div class="main-container" id="mf">
      <RouterView v-slot="{ Component, route }">
        <keep-alive>
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </RouterView>
    </div>

    <a
      class="mob-beian-link"
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noopener noreferrer"
    >
      豫ICP备2024081960号
    </a>

    <div class="mob-footer">
      <div
        class="bot-channel"
        :class="{ active: activePath == '/' || activePath == '/home' }"
      >
        <router-link to="/home">
          <SvgIcon name="home" alt="home" />
          <span class="text">首页</span>
        </router-link>
      </div>
      <div class="bot-channel" :class="{ active: activePath === '/aigc' }">
        <router-link to="/aigc">
          <SvgIcon name="ai" alt="ai" />
          <span class="text">AI</span>
        </router-link>
      </div>
      <div class="bot-channel" :class="{ active: activePath === '/canvas' }">
        <router-link to="/canvas">
          <SvgIcon name="canvas" alt="canvas" />
          <span class="text">画布</span>
        </router-link>
      </div>
      <div class="bot-channel" :class="{ active: activePath === '/me' }">
        <router-link to="/me">
          <SvgIcon name="me" alt="me" />
          <span class="text">个人中心</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import Btn from '@/baseCom/btn/btn.vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { ref, computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
const route = useRoute()

// 当前激活路径
const activePath = computed(() => route.path)
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
    padding: 0 12px 0 16px;
    color: var(--btn-text-color);
    top: 0;
    flex-shrink: 0;
    .right {
      display: flex;
      align-items: center;
      gap: var(--horizontalGapPx);
    }
  }
  .main-container {
    padding: 0 var(--horizontalGapPx);
    flex: auto;
    overflow: auto;
  }
  .mob-beian-link {
    flex-shrink: 0;
    color: var(--text-secondary, var(--text-default));
    font-size: var(--font-size-sm);
    line-height: 28px;
    text-align: center;
    text-decoration: none;
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
    }
    .active {
      .svg-icon {
        color: var(--text-active);
      }
    }
  }
}

.logo {
  font-size: var(--font-size-xl);
  font-weight: bold;
}

.menu-btn {
  background: none;
  border: none;
  color: var(--btn-text-color);
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
  background: var(--color-surface-card);
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
  border-bottom: 1px solid var(--color-border-subtle);
}

.mob-drawer a {
  display: block;
  padding: var(--space-4);
  color: var(--color-text-primary);
  text-decoration: none;
  font-size: var(--font-size-lg);
}

.mob-drawer a:hover {
  background: var(--color-surface-muted);
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
  padding: var(--space-4);
  background: var(--color-surface-muted);
}
</style>
