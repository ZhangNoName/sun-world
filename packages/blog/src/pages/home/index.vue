<script setup lang="ts" name="content">
import BlogCard from '@/components/BlogCard/index.vue'
import { BlogListData } from './index.data'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import WeatherCard from '@/components/WeatherCard/index.vue'
import ZFooter from '@/layout/footer/index.vue'
import ZHeader from '@/layout/header/index.vue'
interface Props {
  title?: string
  subTitle: string
  icon: string
  iconColor: string
  iconSize: string
  iconBgColor: string
}
const props: Props = defineProps({
  title: { type: String },
  subTitle: { type: String, default: '副标题' },
  icon: { type: String, default: 'icon-z-content' },
  iconColor: { type: String, default: '#fff' },
  iconSize: { type: String, default: '24px' },
  iconBgColor: { type: String, default: '#fff' },
})
</script>
<template>
  <div class="home-page page-container">
    <ZHeader></ZHeader>

    <div class="home-content content">
      <div class="left">
        <SelfInfoCard />
        <WeatherCard />
      </div>
      <div class="right">
        <div class="card summary-card"></div>
        <BlogCard v-for="item in BlogListData" :key="item.id" v-bind="item" />
      </div>
    </div>
    <ZFooter />
  </div>
</template>

<style scoped lang="scss">
@import '../constant.scss';
.home-page {
  .home-content {
    min-height: calc(100vh - 37rem);
    background-color: var(--bg-color);

    display: grid;
    grid-template-columns: 35rem auto;
    grid-template-rows: auto;
    gap: 1rem;
    .card {
      // background-color: white;
      border-radius: 0.5rem;
      height: 10rem;
    }
    .left {
      // max-width: 31rem;
      // background-color: aqua;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .right {
      // background-color: blue;
      .summary-card {
        background-color: var(--bg-color-0);
      }
    }
  }
}
</style>
