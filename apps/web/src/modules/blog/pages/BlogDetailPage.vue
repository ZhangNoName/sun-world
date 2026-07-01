<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import CatalogCard from '../ui/CatalogCard.vue'
import { SunLoadingSkeleton as LoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { getBlogErrorMessage } from '@/modules/blog/errors'
import { useBlogReader } from '../composables/useBlogReader'
import { buildBlogPostingJsonLd, useJsonLd, usePageMeta } from '@/shared/seo'
import { SunIcon } from '@sun-world/icons/vue'
import { SunMarkdownPreview } from '@/shared/markdown'

const route = useRoute()
const id = computed(() => {
  const paramId = route.params.id
  if (Array.isArray(paramId)) return String(paramId[0] || '')
  return String(paramId || route.query.id || '')
})

const {
  blogPreview,
  catalog,
  activeHeadingId,
  loading,
  blogInfo,
  articleCanonical,
  articleDescription,
  publishedAt,
  commentCount,
  wordCount,
  handlePreviewCatalog,
  handlePreviewRendered,
  scrollToHeading,
  loadBlog,
} = useBlogReader(id)

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
      <CatalogCard
        :catalog="catalog"
        :active-id="activeHeadingId"
        @select="scrollToHeading"
      />
    </aside>

    <main class="right">
      <template v-if="loading">
        <LoadingSkeleton :lines="5" />
      </template>

      <template v-else>
        <div class="data-info" aria-label="文章信息">
          <div class="meta-item">
            <SunIcon name="calendar" size="16" />
            <span>{{ publishedAt }}</span>
          </div>
          <div class="meta-item">
            <SunIcon name="message-circle" size="16" />
            <span>{{ commentCount.toLocaleString() }}</span>
          </div>
          <div class="meta-item">
            <SunIcon name="file-text" size="16" />
            <span>{{ wordCount.toLocaleString() }}</span>
          </div>
        </div>

        <h1 class="blog-title">{{ blogInfo.title }}</h1>
        <div class="preview-container" ref="blogPreview" id="blog-preview">
          <SunMarkdownPreview
            :content="blogInfo.content"
            @catalog="handlePreviewCatalog"
            @rendered="handlePreviewRendered"
          />
        </div>
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
  grid-template-columns: minmax(220px, 28rem) minmax(0, 1fr);
  gap: var(--space-6);
}

.left {
  width: 100%;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 88px;
  height: fit-content;
  max-height: calc(100vh - 112px);
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

.preview-container :deep(pre) {
  position: relative;
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
