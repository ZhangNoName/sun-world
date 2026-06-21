<template>
  <div
    ref="containerRef"
    class="waterfall-container"
    :style="{ gap: `${props.gap}px` }"
  >
    <div
      v-for="(col, colIndex) in columns"
      :key="colIndex"
      class="waterfall-column"
      :style="{ width: `${columnWidth}px`, gap: `${props.gap}px` }"
    >
      <article
        v-for="item in col"
        :key="item.id"
        class="waterfall-item"
        tabindex="0"
        role="link"
        @click="showBlog(item)"
        @keydown.enter="showBlog(item)"
        @keydown.space.prevent="showBlog(item)"
      >
        <div class="waterfall-tags">
          <span v-if="item.category" class="waterfall-category">
            {{ item.category }}
          </span>
          <span v-for="tag in item.tags" :key="tag" class="waterfall-tag">
            {{ tag }}
          </span>
        </div>

        <h2 class="waterfall-title">{{ item.title }}</h2>
        <p class="waterfall-abstract">{{ item.abstract }}</p>

        <div class="waterfall-meta">
          <span>{{ item.publishTime }}</span>
          <span>{{ formatCount(item.viewNum) }} 浏览</span>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { BlogListItem } from '@/modules/blog/types'

interface Props {
  list?: BlogListItem[]
  columnCount?: number
  gap?: number
}

const props = withDefaults(defineProps<Props>(), {
  columnCount: 2,
  gap: 12,
  list: () => [],
})

const router = useRouter()
const containerRef = ref<HTMLElement>()
const columns = reactive<BlogListItem[][]>([])
const columnWidth = ref(0)

function formatCount(value: BlogListItem['viewNum']) {
  const count = Number(value ?? 0)
  if (!Number.isFinite(count)) return '0'
  return count >= 10000 ? `${(count / 10000).toFixed(1)}w` : String(count)
}

function estimateCardHeight(item: BlogListItem) {
  const titleRows = Math.ceil(item.title.length / 18)
  const abstractRows = Math.min(Math.ceil(item.abstract.length / 24), 5)
  const tagRows = item.tags.length > 2 ? 2 : 1
  return 96 + titleRows * 24 + abstractRows * 22 + tagRows * 30
}

function renderWaterfall() {
  if (!containerRef.value) return

  const columnCount = Math.max(props.columnCount, 1)
  const containerWidth = containerRef.value.clientWidth
  columnWidth.value =
    (containerWidth - props.gap * (columnCount - 1)) / columnCount

  const heights = Array(columnCount).fill(0)
  columns.splice(
    0,
    columns.length,
    ...Array(columnCount)
      .fill(null)
      .map(() => [])
  )

  props.list.forEach((item) => {
    const minIndex = heights.indexOf(Math.min(...heights))
    columns[minIndex].push(item)
    heights[minIndex] += estimateCardHeight(item) + props.gap
  })
}

function showBlog(item: BlogListItem) {
  router.push({ path: '/blog', query: { id: item.id } })
}

onMounted(() => {
  renderWaterfall()
  window.addEventListener('resize', renderWaterfall)
})

onBeforeUnmount(() => window.removeEventListener('resize', renderWaterfall))

watch(
  () => [props.list, props.columnCount, props.gap],
  () => renderWaterfall(),
  { deep: true }
)
</script>

<style scoped>
.waterfall-container {
  display: flex;
  align-items: flex-start;
  width: 100%;
}

.waterfall-column {
  display: flex;
  flex-direction: column;
}

.waterfall-item {
  border: 1px solid var(--card-border-color);
  background-color: var(--card-bg);
  color: var(--text-default);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-sm);
  padding: var(--card-padding);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition:
    background-color var(--motion-duration) var(--motion-ease-standard),
    border-color var(--motion-duration) var(--motion-ease-standard),
    box-shadow var(--motion-duration) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-emphasized);
}

.waterfall-item:hover,
.waterfall-item:focus-visible {
  border-color: var(--card-border-hover);
  box-shadow: var(--card-shadow-hover);
  transform: translateY(-2px);
}

.waterfall-item:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 3px;
}

.waterfall-tags {
  min-height: 28px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.waterfall-category,
.waterfall-tag {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-lighter);
  border-radius: var(--radius-full);
  padding: 0 var(--space-2);
  font-size: var(--font-small);
}

.waterfall-category {
  background: var(--bg-active);
  color: var(--btn-text-color);
  border-color: var(--bg-active);
}

.waterfall-tag {
  background: var(--bg-component);
  color: var(--text-secondary);
}

.waterfall-title {
  margin: 0;
  font-size: var(--font-size-lg);
  line-height: var(--line-height-tight);
}

.waterfall-abstract {
  margin: 0;
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.waterfall-meta {
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-lighter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-small);
}

@media (prefers-reduced-motion: reduce) {
  .waterfall-item {
    transform: none !important;
  }
}
</style>
