<script lang="ts" setup>
import { inject, ref } from 'vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import CatalogCard from '@/components/CatalogCard/index.vue'
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import { BlogDeatil, getBlogById } from '@/service/request'
import { ElMessage } from 'element-plus'
// @ts-ignore
import VditorPreview from 'vditor/dist/method.min'

import {
  Calendar,
  WordCount,
  Comment,
  Clock,
  TagSvg,
} from '@sun-world/icons-vue'
import { BlogEditorClass } from '@/blogEditor'
import Vditor from 'vditor'
import { VditorTreeItemType } from '@/type'
interface Props {}
const props: Props = defineProps()
const iconConfig = ref({
  height: '1.8rem',
  width: '1.8rem',
})
const route = useRoute()
const id = ref<string>((route.query.id as string) || '')
const blogPreview = ref<HTMLElement | null>(null)
const catalog = ref<VditorTreeItemType[]>([])
const blogInfo = ref<BlogDeatil>({
  author: '',
  content: '',
  created_at: '',
  id: '',
  title: '',
  update_at: '',
})
const getCatalog = (): VditorTreeItemType[] => {
  if (!blogPreview.value) return []
  const headers = blogPreview.value.querySelectorAll('h1, h2, h3, h4, h5, h6')

  return Array.from(headers).map((header) => ({
    text: header.textContent || '',
    level: Number(header.tagName.charAt(1)), // 解析 h1~h6 级别
    id: header.id, // Vditor 解析后会自动生成 id
  }))
}
const showBlog = (content: string) => {
  // console.log('content', content)
  if (blogPreview.value) {
    // new Vditor('blog-preview', {
    //   value: content,
    //   mode: 'preview', // 使用所见即所得模式
    //   preview: {
    //     mode: 'both', // 预览模式
    //     actions: [], // 可以自定义预览操作
    //   },
    //   toolbar: [], // 可以自定义工具栏
    // })
    VditorPreview.preview(blogPreview.value, content, {
      theme: {
        current: 'light',
      },
      hljs: {
        style: 'github',
      },
    }).then(() => {
      catalog.value = getCatalog()
      console.log('获取道德标题:', catalog.value)
    })
  }
}
onMounted(() => {
  if (!id.value) {
    ElMessage.error('未找到相应的博客id')
    return
  }
  getBlogById(id.value)
    .then((res) => {
      // console.log('获取到的博客内容', res)
      blogInfo.value = res
      showBlog(res.content)
    })
    .catch((err) => {
      console.log('获取博客内容失败', err)
      ElMessage.error('获取博客内容失败！')
    })
    .finally(() => {
      console.log('获取博客内容完成')
    })
})
</script>

<template>
  <div class="blog-page">
    <div class="left-bg"></div>
    <div class="left">
      <SelfInfoCard />
      <CatalogCard :catalog="catalog" />
    </div>

    <div class="right">
      <div class="data-info">
        <div class="tag">
          <Calendar v-bind="iconConfig" />
          <span>{{ blogInfo.created_at }}</span>
        </div>
        <div class="tag">
          <Comment v-bind="iconConfig" />
          <span>{{ 0 }}</span>
        </div>
        <div class="tag">
          <WordCount v-bind="iconConfig" />
          <span>{{ 1000 }}</span>
        </div>
      </div>
      <h1>{{ blogInfo.title }}</h1>
      <!-- {{ blogInfo.content }} -->
      <div class="preview-container" ref="blogPreview" id="blog-preview"></div>
    </div>
  </div>
</template>

<style scoped>
.blog-page {
  position: relative;
  margin: 6.5rem auto 0 auto;
  height: auto;
  min-height: calc(100vh - 37rem);
  background-color: var(--bg-page);
  width: 85%;
  display: grid;
  grid-template-columns: 35rem auto;
  grid-template-rows: auto;
  gap: 2.5rem;
  .left {
    width: 35rem;
    display: flex;
    flex-direction: column;
    gap: var(--horizontalGapPx);
    position: fixed;
  }
  .left-bg {
    /* background-color: var(--bg-brand-light); */
    /* background-color: #f8f9fa; */
  }
  .right {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    gap: var(--horizontalGapPx);
    .data-info {
      height: 4rem;
      font-size: 1.2rem;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: var(--horizontalGapPx);
      .tag {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    }
  }
}
</style>
