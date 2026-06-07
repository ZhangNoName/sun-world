<script setup lang="ts">
import { onMounted, onUnmounted, provide, reactive, watch, inject } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Ref } from 'vue'
import SwLayout from '@/layout/layout.vue'
import { fetchBaseData } from './util/request'
import { fetchBlogStats } from '@/modules/blog/api'
import type {
  CategoryResponse,
  StatsResponse,
  TagResponse,
} from '@/modules/blog/types'
import { DEFAULT_STATS } from './util/data'
import { useTheme } from '@/shared/design'

const STORAGE_LOCALE = 'locale'
const DEFAULT_LOCALE = 'zh'

const { locale } = useI18n()
const { theme } = useTheme()

// 从本地缓存初始化 locale
locale.value = localStorage.getItem(STORAGE_LOCALE) || DEFAULT_LOCALE

provide('theme', theme)
provide('locale', locale)

// Route loading bar state (installed by useRouteLoading in main.ts)
const routeLoading = inject<Ref<boolean>>('routeLoading')

const tagList = reactive<TagResponse[]>([])
const categoryList = reactive<CategoryResponse[]>([])
const stats = reactive<StatsResponse>(DEFAULT_STATS)
provide('tagList', tagList)
provide('categoryList', categoryList)
provide('stats', stats)

const allClass = computed(() => 'app-container')

/** 将多语言同步到 document.documentElement（html） */
const applyLocale = () => {
  document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en'
}

// 监听 locale 变化：同步到 html 并写入本地缓存（theme 由 useTheme() 自行管理）
watch(locale, (newLocale) => {
  applyLocale()
  localStorage.setItem(STORAGE_LOCALE, newLocale)
})

/** 其他标签页修改 locale 时同步到当前页 */
const onStorageChange = (e: StorageEvent) => {
  if (e.key === STORAGE_LOCALE) {
    locale.value = e.newValue || DEFAULT_LOCALE
  }
}

const getAllBaseData = async () => {
  fetchBaseData().then((res) => {
    tagList.splice(0, tagList.length, ...res.tags)
    categoryList.splice(0, categoryList.length, ...res.categories)
  })
  fetchBlogStats().then((res) => {
    Object.assign(stats, res)
  })
}

onMounted(() => {
  applyLocale()
  getAllBaseData()
  window.addEventListener('storage', onStorageChange)
})
onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange)
})
</script>

<template>
  <div :class="allClass">
    <!-- Route-level loading bar -->
    <div
      v-if="routeLoading"
      class="route-loading-bar"
      aria-label="正在加载页面"
      role="progressbar"
    ></div>
    <SwLayout />
  </div>
</template>
<style>
.el-upload-dragger {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
}
</style>
<style scoped>
.app-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;

  color: var(--text-default);
  background-color: var(--bg-page);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  .header {
  }
  .content {
    width: 85%;
    position: relative;
    margin: 6.5rem auto 0 auto;
    flex: 1;
  }
  .footer {
  }
}

.route-loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  width: 100%;
  height: 3px;
  overflow: hidden;
  background: transparent;
}

.route-loading-bar::before {
  content: '';
  display: block;
  width: 42%;
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(
    90deg,
    transparent,
    var(--color-brand),
    var(--color-brand-light)
  );
  animation: route-loading-slide 1s var(--motion-ease-standard) infinite;
}

@keyframes route-loading-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(240%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-loading-bar::before {
    animation: none;
    width: 100%;
  }
}
</style>
