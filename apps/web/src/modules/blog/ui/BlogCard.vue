<script setup lang="ts">
import Tag from '@/components/Tag/index.vue'
import type { BlogCardProps } from '@/modules/blog/types'
import { useRouter } from 'vue-router'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'

const props = defineProps<BlogCardProps>()

const {
  title,
  abstract,
  publishTime,
  lastUpdateTime,
  tags,
  category = 'js',
  byteNum = 10000,
  commentNum = 0,
  viewNum = 0,
  id,
} = props

const router = useRouter()
const showBlog = () => {
  router.push({ path: '/blog', query: { id: id } })
}
</script>
<template>
  <article
    class="z-blog-card"
    role="link"
    tabindex="0"
    @click="showBlog"
    @keydown.enter="showBlog"
    @keydown.space.prevent="showBlog"
  >
    <div class="meta-list">
      <span class="meta-item">
        <SvgIcon name="calender" size="small" />
        <span>{{ publishTime }}</span>
      </span>
      <span class="meta-item">
        <SvgIcon name="comment" size="small" />
        <span>{{ commentNum.toLocaleString() }}</span>
      </span>
      <span class="meta-item">
        <SvgIcon name="font-num" size="small" />
        <span>{{ byteNum.toLocaleString() }}</span>
      </span>
    </div>
    <h1 class="card-title">
      <span class="card-title-link">{{ title }}</span>
    </h1>
    <p class="card-body">{{ abstract }}</p>
    <div class="card-footer">
      <div class="blog-tags" @click.stop.prevent>
        <SvgIcon name="tag" size="small" />
        <Tag v-for="tag in tags" :key="tag" :tag="tag" :url="''" />
      </div>
      <hr class="card-divider" />
      <div class="card-actions">
        <button class="read-more-btn" @click.stop="showBlog">
          {{ $t('readMore') }}...
        </button>
        <div class="last-update">
          <SvgIcon name="calender" size="small" />
          <span>{{ lastUpdateTime }}</span>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.z-blog-card {
  border: 1px solid var(--card-border-color);
  background-color: var(--card-bg);
  color: var(--text-default);
  border-radius: var(--card-radius);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: var(--card-padding);
  gap: var(--space-3);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition:
    background-color var(--motion-duration) var(--motion-ease-standard),
    border-color var(--motion-duration) var(--motion-ease-standard),
    box-shadow var(--motion-duration) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-emphasized);
}

.z-blog-card:hover,
.z-blog-card:focus-within {
  box-shadow: var(--card-shadow-hover);
  border-color: var(--card-border-hover);
  transform: translateY(-2px);
}

.z-blog-card:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 3px;
}

/* ---- meta list ---- */
.meta-list {
  color: var(--card-meta-color);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-small);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

/* ---- title ---- */
.card-title {
  margin: 0;
  font-size: var(--font-size-xl);
  line-height: var(--line-height-tight);
  text-align: left;
}

.card-title-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s ease;
}

.card-title-link:hover,
.z-blog-card:hover .card-title-link {
  color: var(--color-brand);
}

/* ---- body (abstract) ---- */
.card-body {
  margin: 0;
  text-align: left;
  line-height: var(--line-height-relaxed);
  font-size: var(--font-medium);
  color: var(--text-secondary);
  /* clamp to 3 lines on desktop */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---- footer ---- */
.card-footer {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: auto;
}

.blog-tags {
  min-height: 30px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
}

.card-divider {
  width: 100%;
  margin: 0;
  border: none;
  border-top: 1px solid var(--border-lighter);
}

.card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.read-more-btn {
  background-color: var(--bg-accent-soft);
  color: var(--text-default);
  border: 1px solid var(--border-lighter);
  border-radius: var(--radius-full);
  padding: 0 var(--space-4);
  cursor: pointer;
  min-height: var(--btn-height-sm);
  display: inline-flex;
  justify-content: center;
  align-items: center;
  font-size: var(--font-small);
  font-family: inherit;
  transition:
    background-color var(--motion-duration) var(--motion-ease-standard),
    border-color var(--motion-duration) var(--motion-ease-standard),
    color var(--motion-duration) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-emphasized);
}

.read-more-btn:hover {
  background-color: var(--bg-active);
  border-color: var(--bg-active);
  color: var(--btn-text-color);
  transform: translateY(-1px);
}

.last-update {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  font-size: var(--font-small);
  color: var(--text-secondary);
  gap: 4px;
}

/* ---- mobile ---- */
@media screen and (max-width: 600px) {
  .z-blog-card {
    padding: var(--space-4);
    gap: var(--space-3);
    border-radius: var(--radius-lg);
  }

  .meta-list {
    gap: var(--space-2);
  }

  .card-title {
    font-size: var(--font-size-lg);
  }

  .card-body {
    -webkit-line-clamp: 4;
  }

  .card-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .read-more-btn {
    width: 100%;
  }

  .last-update {
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .z-blog-card,
  .read-more-btn {
    transform: none !important;
  }
}
</style>
