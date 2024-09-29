<script setup lang="ts">
import { onMounted } from 'vue'
import { computed, ref } from 'vue'
import { onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import ZHeader from './layout/header/index.vue'
import ZFooter from './layout/footer/index.vue'
// import { testApi } from './service/request'
const theme = ref('sun-light')
const { locale } = useI18n()

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
onMounted(() => {
  // getAdressByLocation()
  // testApi()
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
    <div class="header">
      <ZHeader></ZHeader>
    </div>
    <div class="content">
      <RouterView />
    </div>
    <div class="footer">
      <ZFooter />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  font-size: 1.6rem;
  color: var(--font-color);
  background-color: var(--bg-color);
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
    height: auto;
  }
  .footer {
  }
}
</style>
