<template>
  <div class="mob-layout">
    <!-- Header (conditionally shown) -->
    <div v-if="showHeader" class="mob-header">
      <div class="left">
        <img src="/logo.svg" alt="Sun World" width="40" height="40" />
      </div>
      <div class="right">
        <Btn icon="search" @click="toggleDrawer" type="icon" />
        <Btn icon="menu" @click="toggleDrawer" type="icon" />
      </div>
    </div>

    <!-- Main content -->
    <div class="main-container" id="mf">
      <RouterView v-slot="{ Component, route }">
        <keep-alive>
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </RouterView>
    </div>

    <!-- ICP filing -->
    <a
      v-if="showFooter"
      class="mob-beian-link"
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noopener noreferrer"
    >
      豫ICP备2024081960号
    </a>

    <!-- Bottom navigation (conditionally shown) -->
    <nav v-if="showFooter" class="mob-footer">
      <div
        class="bot-channel"
        :class="{ active: activePath === '/' || activePath === '/home' }"
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
          <span class="text">我</span>
        </router-link>
      </div>
    </nav>

    <!-- Drawer overlay -->
    <Transition name="drawer-fade">
      <div
        v-if="drawerOpen"
        class="mob-drawer-overlay"
        role="presentation"
        @click="toggleDrawer"
      />
    </Transition>

    <!-- Slide-in drawer -->
    <Transition name="drawer-slide">
      <aside
        v-if="drawerOpen"
        class="mob-drawer"
        role="dialog"
        aria-label="导航菜单"
        aria-modal="true"
      >
        <div class="drawer-header">
          <span class="drawer-title">Sun World</span>
          <button
            class="drawer-close"
            type="button"
            aria-label="关闭导航菜单"
            @click="toggleDrawer"
          >
            ✕
          </button>
        </div>

        <nav class="drawer-nav">
          <router-link
            to="/home"
            class="drawer-link"
            @click="closeDrawer"
          >
            首页
          </router-link>
          <router-link
            to="/blog"
            class="drawer-link"
            @click="closeDrawer"
          >
            博客
          </router-link>
          <router-link
            to="/aigc"
            class="drawer-link"
            @click="closeDrawer"
          >
            AI
          </router-link>
          <router-link
            to="/canvas"
            class="drawer-link"
            @click="closeDrawer"
          >
            画布
          </router-link>
          <router-link
            to="/tools"
            class="drawer-link"
            @click="closeDrawer"
          >
            工具
          </router-link>
          <router-link
            to="/video"
            class="drawer-link"
            @click="closeDrawer"
          >
            视频
          </router-link>
          <router-link
            to="/me"
            class="drawer-link"
            @click="closeDrawer"
          >
            个人中心
          </router-link>
        </nav>

        <div class="drawer-controls">
          <span class="drawer-label">主题</span>
          <ThemeSwitch />
        </div>
        <div class="drawer-controls">
          <span class="drawer-label">语言</span>
          <LanguageSwitch />
        </div>
      </aside>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import Btn from '@/baseCom/btn/btn.vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import ThemeSwitch from '@/components/ThemeSwitch/index.vue'
import LanguageSwitch from '@/components/LanguageSwitch/index.vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()

// Current active path
const activePath = computed(() => route.path)

const drawerOpen = ref(false)

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function closeDrawer() {
  drawerOpen.value = false
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDrawer()
}

// Respect route meta for header/footer visibility
const showHeader = computed(() => route.meta.hideHeader !== true)
const showFooter = computed(() => route.meta.hideFooter !== true)

watch(
  () => route.fullPath,
  () => closeDrawer()
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.mob-layout {
  height: 100dvh;
  position: fixed;
  bottom: 0;
  background: var(--bg-page);
  width: 100%;
  z-index: 10;
  padding-bottom: env(safe-area-inset-bottom, 0);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* ---- Header ---- */
.mob-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  padding: 0 12px 0 16px;
  color: var(--btn-text-color);
  top: 0;
  flex-shrink: 0;
}

.mob-header .right {
  display: flex;
  align-items: center;
  gap: var(--horizontalGapPx);
}

/* ---- Main container ---- */
.main-container {
  padding: 0 var(--horizontalGapPx);
  flex: auto;
  overflow: auto;
}

/* ---- ICP link ---- */
.mob-beian-link {
  flex-shrink: 0;
  color: var(--text-secondary, var(--text-default));
  font-size: var(--font-size-sm);
  line-height: 28px;
  text-align: center;
  text-decoration: none;
}

/* ---- Bottom navigation ---- */
.mob-footer {
  flex-shrink: 0;
  display: flex;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.bot-channel {
  flex-grow: 1;
  height: 48px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.bot-channel a {
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  gap: 2px;
}

@media screen and (max-width: 695px) {
  .bot-channel .text {
    display: none;
  }
}

.bot-channel.active .svg-icon {
  color: var(--text-active);
}

.bot-channel.active a {
  color: var(--text-active);
}

/* ---- Drawer overlay ---- */
.mob-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 99;
}

/* ---- Drawer ---- */
.mob-drawer {
  position: fixed;
  top: 0;
  left: 0;
  width: 70vw;
  max-width: 280px;
  height: 100dvh;
  background: var(--color-surface-card, var(--bg-page));
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  z-index: 100;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.drawer-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary, var(--text-default));
}

.drawer-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--color-text-secondary, var(--text-secondary));
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--border-radius);
  transition: background-color 0.15s ease;
}

.drawer-close:hover {
  background: var(--color-surface-muted);
}

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
}

.drawer-link {
  display: block;
  padding: 12px 12px;
  color: var(--color-text-primary, var(--text-default));
  text-decoration: none;
  font-size: var(--font-size-md);
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.drawer-link:hover,
.drawer-link:active {
  background: var(--color-surface-muted);
}

/* ---- Drawer controls (theme / language) ---- */
.drawer-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--color-border-subtle, var(--border-default));
}

.drawer-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary, var(--text-secondary));
}

/* ---- Drawer transitions ---- */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.25s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(-100%);
}
</style>
