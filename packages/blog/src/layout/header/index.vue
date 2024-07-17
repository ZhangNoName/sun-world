<script setup lang="ts" name="header">
import { Search, QQOutlined, GithubOutlined } from '@sun-world/icons-vue'
import LanguageSwitch from '@/components/LanguageSwitch/index.vue'
import ThemeSwitch from '@/components/ThemeSwitch/index.vue'
import { openGithub } from '@/util'
import { onBeforeUnmount, onMounted, ref } from 'vue'
const time = ref('')
const timerRef = ref()
const getCurrentTime = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = ('0' + (now.getMonth() + 1)).slice(-2)
  const day = ('0' + now.getDate()).slice(-2)
  const hours = ('0' + now.getHours()).slice(-2)
  const minutes = ('0' + now.getMinutes()).slice(-2)
  const seconds = ('0' + now.getSeconds()).slice(-2)
  // return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`
  return `${hours}:${minutes}:${seconds}`
}
const updateTime = () => {
  time.value = getCurrentTime()
  timerRef.value = requestAnimationFrame(updateTime)
}
onMounted(() => {
  timerRef.value = requestAnimationFrame(updateTime)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(timerRef.value)
})
</script>
<template>
  <div class="z-header">
    <div class="left-menu">
      <div class="logo"></div>
      <div class="welcom">{{ $t('title') }}</div>
      <div class="menu-item"></div>
    </div>
    <div class="right-menu">
      <div class="link-icon">
        <GithubOutlined @click="openGithub" />
        <QQOutlined />
        <Search />
        <LanguageSwitch />
        <ThemeSwitch />
        <!-- <AddOutlined></AddOutlined> -->
      </div>
    </div>
    <div class="time">
      {{ time }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.z-header {
  width: 100%;
  height: 5rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 7.5% 4fr 3fr 10rem 7.5%;
  grid-template-areas: '1 2 3 4 5';
  border-bottom: 2px solid rgb(180, 180, 180);
  background-color: rgba(255, 255, 255, 0.3); /* 半透明背景色 */
  backdrop-filter: blur(10px); /* 毛玻璃效果 */
  -webkit-backdrop-filter: blur(10px); /* 兼容 Safari */
  // opacity: 0.5;
  // background: none;
  .left-menu {
    grid-column: 2 / 3;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 1.5rem;
    .logo {
      width: 5rem;
      height: 5rem;
      background-image: url(/logo.png);
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }
  }
  .right-menu {
    grid-column: 3 / 4;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    .link-icon {
      display: flex;
      gap: 1rem;
      & > *:hover {
        cursor: pointer;
        background-color: var(--icon-bg-hover-color);
      }
    }
  }
  .time {
    grid-column: 4 / 5;
    display: flex;
    justify-content: center;
    align-items: center;
  }
}
</style>
