<script setup lang="ts" name="chat-list">
import { ref } from 'vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
const isExpand = ref<boolean>(false)
const chatList = ref([
  {
    id: 1,
    title: 'AI',
    content: 'AI',
  },
])
const changeExpand = () => {
  isExpand.value = !isExpand.value
}
</script>
<template>
  <aside class="sidebar" :class="{ hide: !isExpand }">
    <div class="sidebar-header">
      <SvgIcon name="sidebar" @click="changeExpand" />
    </div>
    <div class="menu">
      <div class="menu-item">
        <SvgIcon name="ai-add" />
        <span class="name">新聊天</span>
      </div>
      <div class="menu-item">
        <SvgIcon name="search" />
        <span class="name">搜索聊天</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-group">
        <div class="group-title">对话</div>
        <ChannelCard
          v-for="i in 3"
          :key="i"
          :id="String(i)"
          title="关于重构的讨论"
          dialogNum="12"
          createTime="刚刚"
        />
      </div>
    </nav>
  </aside>
</template>
<style scoped>
/* 侧边栏样式 */
.sidebar {
  position: relative;
  width: 260px;
  background-color: #f9f9f9;
  border-right: 1px solid #0d0d0d0d;
  display: flex;
  flex-direction: column;
  transition: all 0.3s linear;
  z-index: 10;
  padding: 6px 10px;

  .sidebar-header {
    padding: calc(var(--spacing) * 1.5) var(--spacing);
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-bottom: calc(var(--spacing) * 4);
    svg {
      cursor: pointer;
    }
  }
  .menu {
    .menu-item {
      display: flex;
      align-items: center;
      gap: calc(var(--spacing) * 2);
      padding: calc(var(--spacing) * 1.5) var(--spacing);

      border-radius: var(--border-radius);
      cursor: pointer;
      &:hover {
        background-color: var(--bg-fill);
      }
      svg {
        flex: none;
      }

      span {
        transition: opacity 0.3s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    .group-title {
      /* font-size: 0.75rem; */
      color: var(--text-secondary);
      margin: 1rem 0.5rem 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      transition: all 0.3s;
    }
  }
}

.hide {
  width: 52px;
  .sidebar-header {
  }
  .menu-item {
    gap: 0;
    span {
      opacity: 0;
      width: 0;
      margin: 0;
      pointer-events: none;
    }
  }
  .group-title {
    opacity: 0;
    height: 0;
    margin: 0;
    pointer-events: none;
  }
}
</style>
