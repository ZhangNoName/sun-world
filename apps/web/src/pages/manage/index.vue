<script lang="ts" setup>
import { ElMenu, ElMenuItem } from 'element-plus'
import ManageBlog from './blog/index.vue'
import ManageAigc from './aigc/index.vue'
import { defineAsyncComponent, ref } from 'vue'

const AdminChartsPage = defineAsyncComponent(
  () => import('@/modules/admin/pages/AdminChartsPage.vue')
)

const AdminMetricsPage = defineAsyncComponent(
  () => import('@/modules/admin/pages/AdminMetricsPage.vue')
)

type MenuIndex = 'total' | 'blog' | 'aigc' | 'metrics'
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
      <ElMenuItem index="metrics">
        <span>请求指标</span>
      </ElMenuItem>
    </ElMenu>
    <!-- </div> -->
    <div class="right">
      <AdminChartsPage v-if="activeMenu === 'total'"></AdminChartsPage>
      <ManageBlog v-else-if="activeMenu === 'blog'"></ManageBlog>
      <ManageAigc v-else-if="activeMenu === 'aigc'"></ManageAigc>
      <AdminMetricsPage v-else-if="activeMenu === 'metrics'" />
    </div>
  </div>
</template>

<style scoped>
.manage-page {
  min-height: 100%;
  background-color: var(--bg-page);

  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  grid-template-rows: auto;
  gap: var(--horizontalGapPx);
  padding: var(--space-4);
  overflow: auto;
}

.left {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-component);
}

.right {
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 720px) {
  .manage-page {
    grid-template-columns: 1fr;
  }

  .left {
    display: flex;
    overflow-x: auto;
  }
}
</style>
