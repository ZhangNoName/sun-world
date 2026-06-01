<script setup lang="ts">
import { onMounted, provide, reactive, watch } from 'vue'
import { computed, ref } from 'vue'
import { onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SwLayout from '@/layout/layout.vue'
import { fetchBaseData } from './util/request'
import {
  CategoryResponse,
  getStats,
  StatsResponse,
  TagResponse,
} from '@/service/baseRequest'
import { DEFAULT_STATS } from './util/data'
import { useDeviceStore } from './store/tg'
// import { testApi } from './service/request'
const STORAGE_THEME = 'theme'
const STORAGE_LOCALE = 'locale'
const DEFAULT_THEME = 'sun-light'
const DEFAULT_LOCALE = 'zh'

const deviceStore = useDeviceStore()
const { locale } = useI18n()

// 从本地缓存初始化，运行后挂载到 html 维护
const theme = ref(localStorage.getItem(STORAGE_THEME) || DEFAULT_THEME)
locale.value = localStorage.getItem(STORAGE_LOCALE) || DEFAULT_LOCALE

provide('theme', theme)
provide('locale', locale)

const tagList = reactive<TagResponse[]>([])
const categoryList = reactive<CategoryResponse[]>([])
const stats = reactive<StatsResponse>(DEFAULT_STATS)
provide('tagList', tagList)
provide('categoryList', categoryList)
provide('stats', stats)

const allClass = computed(() => 'app-container')

/** 将主题与多语言同步到 document.documentElement（html） */
const applyToHtml = () => {
  const html = document.documentElement
  html.lang = locale.value === 'zh' ? 'zh-CN' : 'en'
  html.classList.remove('sun-light', 'sun-dark')
  html.classList.add(theme.value)
}

// 监听 theme/locale 变化：同步到 html 并写入本地缓存
watch(
  [theme, locale],
  ([newTheme, newLocale]) => {
    applyToHtml()
    localStorage.setItem(STORAGE_THEME, newTheme as string)
    localStorage.setItem(STORAGE_LOCALE, newLocale as string)
  },
  { immediate: false }
)

/** 其他标签页修改 localStorage 时同步到当前页 */
const onStorageChange = (e: StorageEvent) => {
  if (e.key === STORAGE_LOCALE) {
    locale.value = e.newValue || DEFAULT_LOCALE
  } else if (e.key === STORAGE_THEME) {
    theme.value = e.newValue || DEFAULT_THEME
  }
}

const getAllBaseData = async () => {
  fetchBaseData().then((res) => {
    // console.log('获取基本信息', res)
    tagList.splice(0, tagList.length, ...res.tags)
    categoryList.splice(0, categoryList.length, ...res.categories)
  })
  getStats().then((res) => {
    Object.assign(stats, res)
    // console.log('获取到的统计数据', stats.value)
  })
}

onMounted(() => {
  applyToHtml()
  getAllBaseData()
  window.addEventListener('storage', onStorageChange)
  console.log('当前环境下的变量', import.meta.env)
})
onUnmounted(() => {
  window.removeEventListener('storage', onStorageChange)
})
</script>

<template>
  <div :class="allClass">
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
</style>
