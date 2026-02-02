<script setup lang="ts" name="chat-list">
import { ref } from 'vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import {
  AIGCSvg,
  CharacterSvg,
  DiscoverSvg,
  DragSvg,
  AddSvg,
  SettingSvg,
  Search,
  EditSvg,
  ExportSvg,
  FullScreenSvg,
  ClearSvg,
  RobotSvg,
} from '@sun-world/icons'
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
  <aside class="sidebar">
    <div class="sidebar-header">
      <SvgIcon name="sidebar" @click="changeExpand" />
    </div>
    <div class="menu">
      <div class="menu-item">
        <SvgIcon name="ai-add" />
        <span>新聊天</span>
      </div>
      <div class="menu-item">
        <SvgIcon name="search" />
        <span>搜索聊天</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-group">
        <div class="group-title" v-if="isExpand">你的聊天</div>
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

    <div class="sidebar-footer">
      <ZBtn class="footer-item" type="text">
        <SettingSvg #icon width="1.4rem" height="1.4rem" color="#0d0d0d" />
        <span v-if="isExpand">设置</span>
      </ZBtn>
    </div>

    <div class="sidebar-drag" @click="changeExpand">
      <DragSvg width="1.2rem" height="1.2rem" />
    </div>
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
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
  padding: 6px 10px;

  .sidebar-header {
    padding: 0.8rem;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .menu {
    .menu-item {
      display: flex;
      justify-content: flex-start;
      align-items: center;
    }
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 0.8rem;
    .group-title {
      font-size: 0.75rem;

      margin: 1rem 0.5rem 0.5rem;
    }
  }

  .sidebar-footer {
    padding: 0.8rem;
    border-top: 1px solid #4d4d4f;
    .footer-item {
      width: 100%;
      justify-content: flex-start;

      background: transparent;
    }
  }

  .sidebar-drag {
    position: absolute;
    right: -10px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 40px;
    background: #202123;
    border: 1px solid #4d4d4f;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
  }
  &:hover .sidebar-drag {
    opacity: 1;
  }
}

&.hide .sidebar {
  width: 0;
  overflow: hidden;
}
</style>
