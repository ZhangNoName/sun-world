<script setup lang="ts" name="content">
import BlogCard from '@/components/BlogCard/index.vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import WeatherCard from '@/components/WeatherCard/index.vue'
import { inject, onMounted, reactive, ref } from 'vue'
import { getBaseInfo, getBlogByPage } from '@/service/request'
import { ElMessage } from 'element-plus'
import { formatDate } from '@/util/function'
import { fetchBaseData } from '@/util/request'
import {
  CategoryResponse,
  getStats,
  StatsResponse,
  TagResponse,
} from '@/service/baseRequest'
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
const blogList = reactive<any[]>([])
const categoryList = inject<CategoryResponse[]>('categoryList', [])
const tagList = inject<TagResponse[]>('tagList', [])

onMounted(async () => {
  // return
  getBlogByPage(1, 10)
    .then((res) => {
      blogList.splice(
        0,
        blogList.length,
        ...res.list.map((o) => {
          return {
            title: o.title,
            abstract: o.abstract,
            lastUpdateTime: formatDate(o.updated_at),
            id: o.id.toString(),
            commentNum: o.comment_num,
            byteNum: o.byte_num,
            tags: o.tag.map((i) => tagList.find((t) => t.id === i)?.name),
            category: categoryList.find((c) => c.id === o.category)?.name,
            viewNum: o.view_num,
            publishTime: formatDate(o.created_at),
          }
        })
      )
      // console.log('最终的博客数据', blogList)
    })
    .catch((e) => {
      ElMessage.error('获取博客列表数据失败！')
      console.error('获取博客列表数据失败', e)
    })
    .finally(() => {})
  // 获取统计数据
})
</script>
<template>
  <div class="home-page">
    <div class="left">
      <SelfInfoCard />
      <WeatherCard />
    </div>
    <div class="right">
      <div class="card summary-card"></div>

      <BlogCard v-for="item in blogList" :key="item.id" v-bind="item" />
    </div>
  </div>
</template>

<style scoped>
.home-page {
  min-height: calc(100vh - 37rem);
  background-color: var(--bg-color);

  display: grid;
  grid-template-columns: 35rem auto;
  grid-template-rows: auto;
  gap: 1rem;
  .card {
    border-radius: 0.5rem;
    height: 10rem;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .right {
    .summary-card {
      background-color: var(--bg-color-0);
    }
  }
}
</style>
