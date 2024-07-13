<script setup lang="ts" name="header">
  import { Search, QQOutlined, GithubOutlined } from '@sun-world/icons-vue'
  import LanguageSwitch from '@/components/LanguageSwitch/index.vue'
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
        <GithubOutlined />
        <QQOutlined />
        <Search />
        <LanguageSwitch />
        <!-- <AddOutlined></AddOutlined> -->
      </div>
    </div>
    <div class="user-menu">
      <!-- <Search />
      <LanguageSwitch /> -->
    </div>
  </div>
</template>

<style scoped lang="scss">
  .z-header {
    width: 100%;
    height: 5rem;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 7.5% 4fr 3fr 5rem 7.5%;
    grid-template-areas: '1 2 3 4 5';
    border-bottom: 2px solid rgb(180, 180, 180);
    // opacity: 0;
    background: none;
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
      }
    }
    .user-menu {
      grid-column: 4 / 5;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }
</style>
