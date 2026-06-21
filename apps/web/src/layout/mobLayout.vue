<template>
  <div class="mob-layout">
    <!-- Header (conditionally shown) -->
    <div v-if="showHeader" class="mob-header">
      <div class="left">
        <img src="/logo.svg" alt="Sun World" width="40" height="40" />
      </div>
      <div class="right">
        <SunButton
          variant="icon"
          size="icon"
          aria-label="搜索"
          @click="toggleDrawer"
        >
          <SvgIcon name="search" />
        </SunButton>
        <SunButton
          variant="icon"
          size="icon"
          aria-label="菜单"
          @click="toggleDrawer"
        >
          <SvgIcon name="menu" />
        </SunButton>
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
          <router-link to="/home" class="drawer-link" @click="closeDrawer">
            首页
          </router-link>
          <router-link to="/blog" class="drawer-link" @click="closeDrawer">
            博客
          </router-link>
          <router-link to="/canvas" class="drawer-link" @click="closeDrawer">
            画布
          </router-link>
          <router-link to="/tools" class="drawer-link" @click="closeDrawer">
            工具
          </router-link>
          <router-link to="/video" class="drawer-link" @click="closeDrawer">
            视频
          </router-link>
          <router-link to="/me" class="drawer-link" @click="closeDrawer">
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
import { SunButton } from '@sun-world/ui/button'
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
  min-height: calc(64px + env(safe-area-inset-top, 0));
  padding: env(safe-area-inset-top, 0) var(--space-3) 0 var(--space-4);
  color: var(--text-default);
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border-color);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
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
  padding: 0 var(--space-3);
  flex: auto;
  overflow: auto;
  scroll-behavior: smooth;
}

/* ---- Bottom navigation ---- */
.mob-footer {
  flex-shrink: 0;
  display: flex;
  min-height: calc(56px + env(safe-area-inset-bottom, 0));
  background: var(--mobile-nav-bg);
  border-top: 1px solid var(--border-lighter);
  padding-bottom: env(safe-area-inset-bottom, 0);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.bot-channel {
  flex-grow: 1;
  min-height: 56px;
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
  gap: var(--space-1);
  min-height: 44px;
  margin: var(--space-1);
  border-radius: var(--radius-lg);
  transition:
    background-color var(--motion-duration) var(--motion-ease-standard),
    color var(--motion-duration) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-emphasized);
}

@media screen and (max-width: 695px) {
  .bot-channel .text {
    display: none;
  }
}

.bot-channel.active .svg-icon {
  color: var(--icon-active-color);
}

.bot-channel.active a {
  color: var(--color-accent);
  background: var(--mobile-nav-active-bg);
}

.bot-channel a:hover,
.bot-channel a:focus-visible {
  background: var(--mobile-nav-active-bg);
  transform: translateY(-1px);
}

/* ---- Drawer overlay ---- */
.mob-drawer-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay-backdrop);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
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
  background: var(--drawer-bg);
  box-shadow: var(--drawer-shadow);
  z-index: 100;
  padding: calc(16px + env(safe-area-inset-top, 0)) 20px
    calc(16px + env(safe-area-inset-bottom, 0));
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
  background: var(--bg-fill);
  border: none;
  font-size: 1.2rem;
  color: var(--color-text-secondary, var(--text-secondary));
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  transition: background-color var(--motion-duration-fast)
    var(--motion-ease-standard);
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
  border-radius: var(--radius-md);
  transition:
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    color var(--motion-duration-fast) var(--motion-ease-standard);
}

.drawer-link:hover,
.drawer-link:active {
  background: var(--color-surface-muted);
  color: var(--color-brand);
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
  transition: opacity var(--motion-duration) var(--motion-ease-standard);
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform var(--motion-duration-slow)
    var(--motion-ease-emphasized);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .main-container {
    scroll-behavior: auto;
  }

  .bot-channel a:hover,
  .bot-channel a:focus-visible {
    transform: none;
  }
}
</style>
