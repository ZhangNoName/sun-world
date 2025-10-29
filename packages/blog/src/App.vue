<script setup lang="ts">
import { onMounted, provide, reactive } from 'vue'
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
const deviceStore = useDeviceStore()
const theme = ref('sun-light')
const { locale } = useI18n()
const tagList = reactive<TagResponse[]>([])
const categoryList = reactive<CategoryResponse[]>([])
const stats = reactive<StatsResponse>(DEFAULT_STATS)
const allClass = computed(() => {
  return 'app-container ' + theme.value
})
const updateLocalStorageValue = (e: StorageEvent) => {
  // console.log('当前信息发生改变', e)
  if (e.key === 'locale') {
    locale.value = e.newValue || 'zh'
    // console.log(e.newValue)
  } else if (e.key === 'theme') {
    theme.value = e.newValue || 'sun-light'
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
provide('tagList', tagList)
provide('categoryList', categoryList)
provide('stats', stats)
onMounted(() => {
  // getAdressByLocation()
  // testApi()
  getAllBaseData()
  window.addEventListener('localestorageChange' as any, updateLocalStorageValue)
  console.log('当前环境下的变量', import.meta.env)
})
onUnmounted(() => {
  window.removeEventListener(
    'localestorageChange' as any,
    updateLocalStorageValue
  )
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
