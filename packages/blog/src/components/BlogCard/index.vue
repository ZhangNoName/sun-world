<script setup lang="ts">
import Tag from '../Tag/index.vue'
import { BlogCardProps } from '@/type'
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
  border: 1px solid var(--border-default);
  background-color: var(--bg-brand-light);
  color: var(--text-default);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  padding: var(--horizontalGapPx);
  gap: 0.625rem;
  cursor: pointer;
  transition: box-shadow 0.25s ease, border-color 0.25s ease;
}

.z-blog-card:hover,
.z-blog-card:focus-within {
  box-shadow: var(--shadow-default);
  border-color: var(--border-active);
}

/* ---- meta list ---- */
.meta-list {
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--horizontalGapPx);
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
  font-size: var(--font-large);
  line-height: 1.4;
  text-align: left;
}

.card-title-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s ease;
}

.card-title-link:hover,
.z-blog-card:hover .card-title-link {
  color: var(--text-hover);
}

/* ---- body (abstract) ---- */
.card-body {
  margin: 0;
  text-align: left;
  line-height: 1.6;
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
  gap: 0.5rem;
  margin-top: auto;
}

.blog-tags {
  min-height: 30px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
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
  gap: 0.5rem;
}

.read-more-btn {
  background-color: var(--bg-component);
  color: var(--text-default);
  border: 1px solid var(--border-default);
  border-radius: var(--border-radius);
  padding: 0 0.75rem;
  cursor: pointer;
  height: 30px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  font-size: var(--font-small);
  font-family: inherit;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.read-more-btn:hover {
  background-color: var(--bg-active);
  color: #fff;
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
    padding: 0.75rem;
    gap: 0.5rem;
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
</style>
