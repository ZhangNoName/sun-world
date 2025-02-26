<script setup lang="ts" name="content">
import BlogCard from '@/components/BlogCard/index.vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import WeatherCard from '@/components/WeatherCard/index.vue'
import { onMounted, reactive } from 'vue'
import { getBaseInfo, getBlogByPage } from '@/service/request'
import { ElMessage } from 'element-plus'
import { formatDate } from '@/util/function'
import { fetchBaseData } from '@/util/request'
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

onMounted(() => {
  fetchBaseData().then((res) => {
    console.log('获取基本信息', res)
  })
  // return
  getBlogByPage(1, 10)
    .then((res) => {
      console.log('返回的数据', res)

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
            tag: o.tag,
            category: o.category,
            viewNum: o.view_num,
          }
        })
      )
    })
    .catch((e) => {
      ElMessage.error('获取博客列表数据失败！')
      console.log('获取博客列表数据失败', e)
    })
    .finally(() => {})
  // getBaseInfo()
  //   .then((res) => {
  //     console.log('获取基本信息', res)
  //   })
  //   .catch((e) => {
  //     ElMessage.error('获取基本信息失败！')
  //     console.log('获取基本信息失败', e)
  //   })
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
