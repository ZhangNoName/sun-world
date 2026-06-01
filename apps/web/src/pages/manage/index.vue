<script lang="ts" setup>
import { ElMenu, ElMenuItem } from 'element-plus'
import ManageBlog from './blog/index.vue'
import Home from './charts/index.vue'
import ManageAigc from './aigc/index.vue'
import { ref } from 'vue'
type MenuIndex = 'total' | 'blog' | 'aigc'
const activeMenu = ref<MenuIndex>('blog')

const handleMenuSelect = (index: string) => {
  activeMenu.value = index as MenuIndex
}
</script>

<template>
  <div class="manage-page">
    <!-- <div class="left"> -->
    <ElMenu
      class="left"
      :default-active="activeMenu"
      @select="handleMenuSelect"
    >
      <ElMenuItem index="total">
        <span>首页</span>
      </ElMenuItem>
      <ElMenuItem index="blog">
        <span>博客管理</span>
      </ElMenuItem>
      <ElMenuItem index="aigc">
        <span>AIGC</span>
      </ElMenuItem>
    </ElMenu>
    <!-- </div> -->
    <div class="right">
      <Home v-if="activeMenu === 'total'"></Home>
      <ManageBlog v-else-if="activeMenu === 'blog'"></ManageBlog>
      <ManageAigc v-else-if="activeMenu === 'aigc'"></ManageAigc>
    </div>
  </div>
</template>

<style scoped>
.manage-page {
  min-height: calc(100vh - 37rem);
  background-color: var(--bg-page);

  display: grid;
  grid-template-columns: 25rem auto;
  grid-template-rows: auto;
  gap: var(--horizontalGapPx);
}
</style>
