<script setup lang="ts" name="APP">
  import { onMounted } from 'vue'
  import MainPage from './pages/index.vue'
  import { computed, ref } from 'vue'
  import { onUnmounted } from 'vue'
  import { useI18n } from 'vue-i18n'
  const theme = ref('sun-light')
  const { locale } = useI18n()

  const allClass = computed(() => {
    return 'app-container ' + theme.value
  })
  const updateLocalStorageValue = (e: StorageEvent) => {
    if (e.key === 'locale') {
      locale.value = e.newValue || 'zh'
    }
  }
  onMounted(() => {
    window.addEventListener('storage', updateLocalStorageValue)
  })
  onUnmounted(() => {
    window.removeEventListener('storage', updateLocalStorageValue)
  })
</script>

<template>
  <div :class="allClass">
    <MainPage />
  </div>
</template>

<style scoped lang="scss">
  .app-container {
    width: 100%;
    height: 100%;
    font-size: 1.6rem;
    color: var(--font-color);
    background-color: var(--background-color);
  }
</style>
