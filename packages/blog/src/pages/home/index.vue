<script setup lang="ts" name="content">
import BlogCard from '@/components/BlogCard/index.vue'
import { ElButton } from 'element-plus'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import WeatherCard from '@/components/WeatherCard/index.vue'
import { inject, onMounted, reactive, ref, VNode, VNodeRef } from 'vue'
import { getBaseInfo, getBlogByPage } from '@/service/request'
import { ElMessage } from 'element-plus'
import { formatDate } from '@/util/function'
import { fetchBaseData } from '@/util/request'
import Waterfall from '@/components/Waterfall/waterfall.vue'

import {
  CategoryResponse,
  getStats,
  StatsResponse,
  TagResponse,
} from '@/service/baseRequest'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { useInfiniteScroll } from '@/hooks/InfiniteScroll'
interface Props {
  title?: string
  subTitle: string
  icon: string
  iconColor: string
  iconSize: string
  iconBgColor: string
}
type ListModeType = 'list' | 'waterfall'
const props: Props = defineProps({
  title: { type: String },
  subTitle: { type: String, default: '副标题' },
  icon: { type: String, default: 'icon-z-content' },
  iconColor: { type: String, default: '#fff' },
  iconSize: { type: String, default: '24px' },
  iconBgColor: { type: String, default: '#fff' },
})
const blogList = reactive<any[]>([])
const loading = ref<boolean>(false)
const hasMore = ref<boolean>(true)
const categoryList = inject<CategoryResponse[]>('categoryList', [])
const tagList = inject<TagResponse[]>('tagList', [])
const totalCount = ref<number>(0) // 博客总数
const listMode = ref<ListModeType>('list')
const page = reactive<{ page: number; pageSize: number }>({
  page: 1,
  pageSize: 5,
})
const changeMode = (mode: ListModeType) => {
  listMode.value = mode
}

/**
 * 核心数据获取和处理逻辑
 * @param append 是否是追加数据（用于加载更多）
 */
const getList = async (append: boolean = false) => {
  if (loading.value || (!hasMore.value && append)) return

  loading.value = true
  try {
    const res = await getBlogByPage(page.page, page.pageSize)
    const newItems = res.list.map((o) => {
      // 数据映射和转换逻辑保持不变，确保 tagList 和 categoryList 是可用的
      return {
        title: o.title,
        abstract: o.abstract,
        lastUpdateTime: formatDate(o.updated_at),
        id: o.id.toString(),
        commentNum: o.comment_num,
        byteNum: o.byte_num,
        // 确保 find 方法可以工作，且 fallback 值是安全的
        tags: o.tag
          .map((i) => tagList.find((t) => t.id === i)?.name)
          .filter(Boolean),
        category:
          categoryList.find((c) => c.id === o.category)?.name || '未分类',
        viewNum: o.view_num,
        publishTime: formatDate(o.created_at),
      }
    })

    if (append) {
      blogList.push(...newItems) // 加载更多时，追加数据
    } else {
      blogList.splice(0, blogList.length, ...newItems) // 首次加载或刷新时，替换数据
    }

    totalCount.value = res.total
    // 判断是否还有更多数据
    hasMore.value = blogList.length < res.total
  } catch (error) {
    ElMessage.error('获取博客列表数据失败！')
    console.error('获取博客列表数据失败', error)
  } finally {
    loading.value = false
  }
}

/**
 * 加载更多按钮的点击事件
 */
const loadMore = async () => {
  if (hasMore.value && !loading.value) {
    page.page++ // 页码递增
    await getList(true) // 调用核心函数，并设置为追加模式
  }
}
const { loaderRef } = useInfiniteScroll(loadMore, {
  rootMargin: '500px',
  root: document.getElementById('mf'),
})
// 组件挂载时，加载第一页数据
onMounted(async () => {
  await getList(false) // 首次加载，不追加
  // 其他统计数据获取等可以在这里继续添加
})
</script>
<template>
  <div class="home-page">
    <div class="left">
      <SelfInfoCard />
      <WeatherCard />
    </div>
    <div class="right">
      <div class="card summary-card">
        <div class="tag" v-for="item in tagList" :key="item.id">
          {{ item.name }}
        </div>
      </div>
      <div class="view-config">
        <div class="des">显示配置：</div>
        <div class="mode-radio">
          <div
            :class="{ active: listMode === 'list' }"
            @click="changeMode('list')"
          >
            <SvgIcon name="list" alt="列表模式" />
          </div>

          <div
            :class="{ active: listMode === 'waterfall' }"
            @click="changeMode('waterfall')"
          >
            <SvgIcon name="waterfall" alt="瀑布流模式" />
          </div>
        </div>
      </div>
      <Waterfall v-if="listMode === 'waterfall'" :columnCount="3" />
      <BlogCard v-else v-for="item in blogList" :key="item.id" v-bind="item" />
      <div class="loader-btn" ref="loaderRef">
        <el-button
          type="primary"
          class="load-more"
          :loading="loading"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? '正在加载...' : hasMore ? '加载更多' : '没有更多了' }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  width: 100%;
  margin: 0 auto;
  max-width: 1280px;
  background-color: var(--bg-page);
  display: flex;
  /* grid-template-columns: 35rem 1fr;
  grid-template-rows: auto; */
  gap: var(--horizontalGapPx);

  .card {
    border-radius: 0.5rem;
    height: 10rem;
  }

  .left {
    width: 35rem;
    display: flex;
    flex-direction: column;
    gap: var(--horizontalGapPx);
  }
  .right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--horizontalGapPx);
    .summary-card {
      padding: 1.4rem;
      background-color: var(--bg-brand-light);
      min-height: 10rem;
      display: flex;
      gap: var(--horizontalGapPx);
      .tag {
        background-color: var(--bg-hover);
        height: fit-content;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
      }
    }
    .view-config {
      display: flex;
      align-items: center;
      gap: var(--horizontalGapPx);
      .mode-radio {
        display: flex;
        gap: var(--horizontalGapPx);
        div {
          cursor: pointer;
          /* 统一设置点击区域尺寸和样式 */
          width: 2rem;
          height: 2rem; /* 增加高度确保是方形点击区 */
          display: flex; /* 确保 img 居中 */
          align-items: center;
          justify-content: center;

          padding: 0.5rem;
          border-radius: 0.6rem;
          transition: background 0.3s; /* 添加过渡效果 */

          img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        }
        .active {
          background: var(--bg-active);
        }
      }
    }
    .loader-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      .load-more {
        width: fit-content;
        margin: auto;
      }
    }
  }
  @media screen and (max-width: 695px) {
    .left {
      display: none;
    }
  }
}
</style>
