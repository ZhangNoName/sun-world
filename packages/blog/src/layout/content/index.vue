<script setup lang="ts" name="content">
  import BlogCard from '@/components/BlogCard/index.vue'
  import { BlogListData } from './index.data'
  import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
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
  <div class="z-content">
    <div class="z-content-left">
      <SelfInfoCard />
    </div>
    <div class="z-content-right">
      <div class="z-content-card summary-card"></div>
      <BlogCard v-for="item in BlogListData" :key="item.id" v-bind="item" />
    </div>
  </div>
</template>

<style scoped lang="scss">
  .z-content {
    background-color: none;
    width: 85%;
    margin: 0 auto;
    display: grid;
    // justify-content: space-between;
    grid-template-columns: 1fr 2fr;
    grid-template-rows: auto;
    gap: 1rem;
    .z-content-card {
      background-color: white;
      border-radius: 0.5rem;
      height: 10rem;
    }
    .self-card {
      height: 40rem;
    }

    .z-content-left {
      // max-width: 31rem;
      // background-color: aqua;
    }
    .z-content-right {
      // background-color: blue;
    }
  }
</style>
