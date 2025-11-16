<script setup lang="ts">
import ZHeader from './header/index.vue'
import ZFooter from './footer/index.vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
const route = useRoute() // 2. 获取当前路由对象
// 3. 计算属性：判断 Header 是否应该隐藏
const showHeader = computed(() => {
  // 检查当前路由的 meta.hideHeader 字段是否为 true
  return route.meta.hideHeader !== true
})

// 4. 计算属性：判断 Footer 是否应该隐藏
const showFooter = computed(() => {
  // 检查当前路由的 meta.hideFooter 字段是否为 true
  return route.meta.hideFooter !== true
})

const contentClass = computed(() => {
  return route.meta.className
})
</script>
<template>
  <div class="desk-layout">
    <ZHeader v-if="showHeader"></ZHeader>

    <div class="content" :class="contentClass">
      <RouterView />
    </div>
    <div class="footer" v-if="showFooter">
      <ZFooter />
    </div>
  </div>
</template>

<style scoped>
.desk-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: var(--horizontalGapPx);
  .header {
    flex: none;
  }
  .content {
    flex: 1;
  }
  .footer {
    flex: none;
  }
}
</style>
