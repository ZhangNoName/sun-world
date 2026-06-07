<script lang="ts" setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import CatalogCard from '@/components/CatalogCard/index.vue'
import LoadingSkeleton from '@/shared/ui/LoadingSkeleton.vue'
import { fetchBlogById } from '@/modules/blog/api'
import { getBlogErrorMessage } from '@/modules/blog/errors'
import type { BlogDetail } from '@/modules/blog/types'
import { formatDate } from '@/util/function'
import { Calendar, WordCount, Comment } from '@sun-world/icons'
import type { VditorTreeItemType } from '@/type'
// @ts-ignore
import VditorPreview from 'vditor/dist/method.min'

const route = useRoute()

const iconConfig = {
  height: '1.6rem',
  width: '1.6rem',
}

const blogPreview = ref<HTMLElement | null>(null)
const catalog = ref<VditorTreeItemType[]>([])
const loading = ref(false)
const blogInfo = ref<BlogDetail>({
  author: '',
  abstract: '',
  byte_num: 0,
  category: null,
  comment_num: 0,
  content: '',
  created_at: '',
  id: 0,
  tag: [],
  title: '',
  updated_at: '',
  view_num: 0,
})

const id = computed(() => String(route.query.id || ''))
const publishedAt = computed(() =>
  blogInfo.value.created_at ? formatDate(blogInfo.value.created_at) : '-'
)
const commentCount = computed(() => blogInfo.value.comment_num ?? 0)
const wordCount = computed(
  () => blogInfo.value.byte_num ?? blogInfo.value.content.length
)

function getCatalog(): VditorTreeItemType[] {
  if (!blogPreview.value) return []

  const headers = blogPreview.value.querySelectorAll('h1, h2, h3, h4, h5, h6')
  return Array.from(headers).map((header) => ({
    text: header.textContent || '',
    level: Number(header.tagName.charAt(1)),
    id: header.id,
  }))
}

async function renderPreview(content: string) {
  await nextTick()
  if (!blogPreview.value) return

  await VditorPreview.preview(blogPreview.value, content, {
    theme: {
      current: 'light',
    },
    hljs: {
      style: 'github',
    },
  })
  catalog.value = getCatalog()
}

async function loadBlog() {
  if (!id.value) {
    ElMessage.error('未找到相应的博客 id')
    return
  }

  loading.value = true
  try {
    const detail = await fetchBlogById(id.value)
    blogInfo.value = detail
    await renderPreview(detail.content)
  } catch (error) {
    ElMessage.error(getBlogErrorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadBlog()
})
</script>

<template>
  <div class="blog-page">
    <aside class="left" aria-label="文章侧边栏">
      <SelfInfoCard />
      <CatalogCard :catalog="catalog" />
    </aside>

    <main class="right">
      <template v-if="loading">
        <LoadingSkeleton :lines="5" />
      </template>

      <template v-else>
        <div class="data-info" aria-label="文章信息">
          <div class="meta-item">
            <Calendar v-bind="iconConfig" />
            <span>{{ publishedAt }}</span>
          </div>
          <div class="meta-item">
            <Comment v-bind="iconConfig" />
            <span>{{ commentCount.toLocaleString() }}</span>
          </div>
          <div class="meta-item">
            <WordCount v-bind="iconConfig" />
            <span>{{ wordCount.toLocaleString() }}</span>
          </div>
        </div>

        <h1 class="blog-title">{{ blogInfo.title }}</h1>
        <div
          class="preview-container"
          ref="blogPreview"
          id="blog-preview"
        ></div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.blog-page {
  position: relative;
  width: 100%;
  max-width: var(--container-max-width);
  min-height: calc(100vh - 12rem);
  margin: 0 auto;
  padding: var(--space-8) var(--container-inline-padding) var(--space-12);
  background-color: var(--bg-page);
  display: grid;
  grid-template-columns: minmax(240px, 32rem) minmax(0, 1fr);
  gap: var(--space-8);
}

.left {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  position: sticky;
  top: 80px;
  height: fit-content;
}

.right {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  gap: var(--space-4);
}

.data-info {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: var(--space-3);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  white-space: nowrap;
}

.blog-title {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--font-size-3xl);
  line-height: var(--line-height-tight);
}

.preview-container {
  min-width: 0;
  border: 1px solid var(--border-lighter);
  border-radius: var(--card-radius);
  background: var(--bg-component);
  padding: var(--space-6);
}

@media screen and (max-width: 1024px) {
  .blog-page {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  .left {
    display: none;
  }
}

@media screen and (max-width: 695px) {
  .blog-page {
    padding: var(--space-4) 0 var(--space-8);
  }

  .blog-title,
  .data-info {
    padding-inline: var(--horizontalGapPx);
  }

  .blog-title {
    font-size: var(--font-size-2xl);
  }

  .preview-container {
    border-inline: none;
    border-radius: 0;
    padding: var(--space-4) var(--horizontalGapPx);
  }
}
</style>
