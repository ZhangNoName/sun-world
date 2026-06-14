<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import SelfInfoCard from '../ui/SelfInfoCard.vue'
import CatalogCard from '../ui/CatalogCard.vue'
import LoadingSkeleton from '@/shared/ui/LoadingSkeleton.vue'
import { getBlogErrorMessage } from '@/modules/blog/errors'
import { useBlogReader } from '../composables/useBlogReader'
import {
  buildBlogPostingJsonLd,
  useJsonLd,
  usePageMeta,
} from '@/shared/seo'
import { Calendar, WordCount, Comment } from '@sun-world/icons'

const route = useRoute()
const id = computed(() => String(route.query.id || ''))

const {
  blogPreview,
  catalog,
  loading,
  blogInfo,
  articleCanonical,
  articleDescription,
  publishedAt,
  commentCount,
  wordCount,
  loadBlog,
} = useBlogReader(id)

const iconConfig = {
  height: '1.6rem',
  width: '1.6rem',
}

usePageMeta(() => ({
  title: blogInfo.value.title
    ? `${blogInfo.value.title} - Sun World`
    : '博客详情 - Sun World',
  description: articleDescription.value,
  canonical: articleCanonical.value,
  ogType: 'article',
}))

useJsonLd(
  () =>
    blogInfo.value.id
      ? buildBlogPostingJsonLd({
          title: blogInfo.value.title,
          description: articleDescription.value,
          author: blogInfo.value.author,
          datePublished: blogInfo.value.created_at,
          dateModified: blogInfo.value.updated_at,
          canonicalUrl: articleCanonical.value,
          wordCount: wordCount.value,
        })
      : null,
  'blog-posting'
)

onMounted(() => {
  if (!id.value) {
    ElMessage.error('未找到相应的博客 id')
    return
  }

  loadBlog().catch((error) => {
    ElMessage.error(getBlogErrorMessage(error))
  })
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
