<script setup lang="ts" name="chat-list">
import { ref, onUnmounted } from 'vue'
import { ClickOutside as vClickOutside } from 'element-plus'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { ISession } from '@/types/ai.type'
import ZBtn from '@/components/ZBtn/index.vue'

const props = defineProps<{
  list: ISession[]
  id: string
  onSelect: (id: string) => void
}>()

const isExpand = ref<boolean>(true)
const activeItem = ref<string | null>(null)
const showMenu = ref(false)
const menuStyle = ref({ top: '0px', left: '0px' })

const changeExpand = () => {
  isExpand.value = !isExpand.value
}

const handleClick = (id: string) => {
  props.onSelect(id)
  closeMenu()
}

const closeMenu = () => {
  showMenu.value = false
  activeItem.value = null
}

const handleMoreClick = (evt: MouseEvent, item: ISession) => {
  const target = evt.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  // 计算菜单位置：显示在按钮下方，并向左微调对齐
  menuStyle.value = {
    top: `${rect.bottom + 5}px`,
    left: `${rect.left - 80}px`, // 根据菜单宽度调整偏移量
  }

  activeItem.value = item.id
  showMenu.value = true
}

const handleDelete = () => {
  console.log('删除 ID:', activeItem.value)
  closeMenu()
}

const handleRename = () => {
  console.log('重命名 ID:', activeItem.value)
  closeMenu()
}

// 点击菜单外部时关闭
const onClickOutside = () => {
  if (showMenu.value) closeMenu()
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
        <div class="group-title">最近对话</div>
        <div
          v-for="item in list"
          :key="item.id"
          class="chat-item"
          :class="{
            active: id === item.id,
            'more-active': activeItem === item.id && showMenu,
          }"
          @click="handleClick(item.id)"
        >
          <div class="title">{{ item.name }}</div>
          <div class="more-btn" @click.stop="handleMoreClick($event, item)">
            <SvgIcon name="more" />
          </div>
        </div>
      </div>
    </nav>
  </aside>

  <!-- 使用 Teleport 将菜单挂载到 Body -->
  <teleport to="body">
    <div
      v-if="showMenu"
      v-click-outside="onClickOutside"
      class="custom-more-menu"
      :style="menuStyle"
      @click.stop
    >
      <z-btn type="ghost" class="menu-option" @click="handleRename">
        <SvgIcon name="edit" size="small" />
        重命名
      </z-btn>
      <z-btn type="ghost" class="menu-option delete" @click="handleDelete">
        <SvgIcon name="delete" size="small" />
        删除
      </z-btn>
    </div>
  </teleport>
</template>

<style scoped>
.sidebar {
  position: relative;
  width: 260px;
  background-color: #f9f9f9;
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 10px;
  height: 100%;

  .sidebar-header {
    padding: 10px;
    margin-bottom: 20px;
    svg {
      cursor: pointer;
      color: #666;
    }
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
    &:hover {
      background: #ececec;
    }
    .name {
      white-space: nowrap;
      font-size: 0.9rem;
      color: #333;
    }
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    margin-top: 20px;

    .group-title {
      font-size: 0.75rem;
      color: #999;
      margin: 10px 10px 5px;
    }

    .chat-item {
      display: flex;
      align-items: center;
      padding: 0 10px;
      margin: 2px 0;
      border-radius: 8px;
      cursor: pointer;
      position: relative;
      gap: 8px;

      &:hover,
      &.active,
      &.more-active {
        background: #ececec;
      }

      &:has(.more-btn:hover) {
        background: transparent;
      }

      .title {
        flex: 1;
        padding: 12px 0;
        font-size: 0.9rem;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }

      .more-btn {
        opacity: 0;
        padding: 4px;
        border-radius: 4px;
        transition: opacity 0.2s, background 0.2s;
        &:hover {
          background: rgba(0, 0, 0, 0.1);
        }
      }

      &:hover .more-btn,
      &.more-active .more-btn {
        opacity: 1;
      }
    }
  }
}

.hide {
  width: 60px;
  .name,
  .group-title,
  .title {
    display: none;
  }
  .chat-item {
    justify-content: center;
    .more-btn {
      display: none;
    }
  }
}

/* Teleport 菜单样式 */
</style>

<style>
/* 全局样式，因为 Teleport 到了 Body */
.custom-more-menu {
  position: fixed;
  background: white;
  overflow: hidden;
  border-radius: var(--border-radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 0;
  min-width: 140px;
  z-index: 9999;
  border: 1px solid rgba(0, 0, 0, 0.05);
  animation: menuFadeIn 0.15s ease-out;
  display: flex;
  flex-direction: column;
  /* gap: var(--spacing); */
}

.menu-option {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: calc(var(--spacing) * 2);
  cursor: pointer;
  border-radius: 0;

  transition: background 0.2s;
}

@keyframes menuFadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
