<script setup lang="ts">
  import { ref } from 'vue'
  // 定义组件的 props
  // const props = defineProps<{}>()
  const locale = ref(localStorage.getItem('locale') || 'zh')
  const changeLanguage = () => {
    localStorage.setItem('locale', locale.value == 'zh' ? 'en' : 'zh')
  }
</script>

<template>
  <div className="language-btn" @click="changeLanguage">
    <span className="language-zh language-item">
      {{ locale == 'zh' ? '中' : 'En' }}
    </span>
    <span className="language-en language-item">
      {{ locale == 'en' ? '中' : 'En' }}
    </span>
  </div>
</template>

<style scoped lang="scss">
  .language-btn {
    height: 28px;
    width: 28px;
    transition: all 0.2s;
    position: relative;
    border-radius: 2px;
    &:hover {
      background-color: var(--hover-background-color);
      cursor: pointer;
    }
    .language-item {
      font-size: 14px;
      line-height: 1;
      position: absolute;
      border: 1px solid var(--border-color);
    }
    .language-zh {
      left: 3px;
      top: 3px;
      z-index: 1;
      background-color: #fff;
      color: #000;
    }
    .language-en {
      right: 3px;
      bottom: 3px;
      z-index: 0;
    }
  }
</style>
