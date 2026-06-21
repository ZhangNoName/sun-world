<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import BlogCard from './BlogCard.vue'
import Waterfall from '@/components/Waterfall/waterfall.vue'
import { SunButton } from '@sun-world/ui/button'
import { SunLoadingSkeleton as LoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import { useBlogBaseData } from '../composables/useBlogBaseData'
import { useInfiniteScroll } from '@/hooks/InfiniteScroll'
import { useBreakpoint } from '@/hooks/breakpoint/breakpoint'
import { useBlogList } from '../composables/useBlogList'
import type { BlogSortBy, BlogSortOrder } from '../types'

type ListModeType = 'list' | 'waterfall'
type SortOption = `${BlogSortBy}:${BlogSortOrder}`

const { tagList, categoryList, loadBlogBaseData } = useBlogBaseData()
const blogList = useBlogList(tagList, categoryList)
const listMode = ref<ListModeType>('list')
const searchKeyword = ref('')
const sortOption = ref<SortOption>('updated_at:desc')
const { screen } = useBreakpoint()

const isInitialLoading = computed(
  () => blogList.loading.value && blogList.items.value.length === 0
)
const isEmpty = computed(
  () => !blogList.loading.value && blogList.items.value.length === 0
)
const canUseWaterfall = computed(() => !['xs', 'sm'].includes(screen.value))
const waterfallColumns = computed(() => {
  if (screen.value === 'md') return 2
  return 3
})
const visibleTagLabels = computed(() => {
  const labels = tagList.map((item) => {
    if (/^frontend-basic-\d{2}$/.test(item.name)) return '前端基础'
    if (/^algorithm-basic-\d{2}$/.test(item.name)) return '算法基础'
    return item.name
  })
  return Array.from(new Set(labels)).slice(0, 12)
})

const changeMode = (mode: ListModeType) => {
  if (mode === 'waterfall' && !canUseWaterfall.value) {
    listMode.value = 'list'
    return
  }
  listMode.value = mode
}

const loadMore = async () => {
  try {
    await blogList.loadMore()
  } catch (error) {
    ElMessage.error('获取博客列表数据失败')
    console.error('获取博客列表数据失败', error)
  }
}

const applyBlogQuery = async () => {
  const [sortBy, sortOrder] = sortOption.value.split(':') as [
    BlogSortBy,
    BlogSortOrder,
  ]
  try {
    await blogList.updateQuery({
      keyword: searchKeyword.value,
      sortBy,
      sortOrder,
    })
  } catch (error) {
    ElMessage.error('获取博客列表数据失败')
    console.error('获取博客列表数据失败', error)
  }
}

const clearSearch = async () => {
  searchKeyword.value = ''
  await applyBlogQuery()
}

const { loaderRef } = useInfiniteScroll(loadMore, {
  rootMargin: '500px',
  root: document.getElementById('mf'),
})

watch(canUseWaterfall, (enabled) => {
  if (!enabled && listMode.value === 'waterfall') {
    listMode.value = 'list'
  }
})

onMounted(async () => {
  await loadBlogBaseData().catch((error) => {
    console.error('获取博客基础数据失败:', error)
  })

  try {
    await blogList.loadFirstPage()
  } catch (error) {
    ElMessage.error('获取博客列表数据失败')
    console.error('获取博客列表数据失败', error)
  }
})
</script>

<template>
  <main class="right">
    <section class="summary-card" aria-label="文章标签">
      <button
        v-for="item in visibleTagLabels"
        :key="item"
        class="tag"
        type="button"
      >
        {{ item }}
      </button>
    </section>

    <section class="query-panel" aria-label="博客筛选">
      <div class="search-box">
        <input
          v-model="searchKeyword"
          class="search-input"
          type="search"
          placeholder="搜索标题或摘要"
          @keydown.enter="applyBlogQuery"
        />
        <button
          v-if="searchKeyword"
          class="clear-search"
          type="button"
          aria-label="清空搜索"
          @click="clearSearch"
        >
          x
        </button>
      </div>

      <select
        v-model="sortOption"
        class="sort-select"
        aria-label="排序方式"
        @change="applyBlogQuery"
      >
        <option value="updated_at:desc">最新优先</option>
        <option value="updated_at:asc">最早优先</option>
        <option value="view_num:desc">浏览量最高</option>
      </select>

      <button class="search-submit" type="button" @click="applyBlogQuery">
        搜索
      </button>
    </section>

    <section class="view-config" aria-label="显示配置">
      <div class="des">显示配置</div>
      <div class="mode-radio" role="group" aria-label="文章列表显示模式">
        <button
          type="button"
          :class="{ active: listMode === 'list' }"
          aria-label="列表模式"
          :aria-pressed="listMode === 'list'"
          @click="changeMode('list')"
        >
          <SvgIcon name="list" alt="列表模式" />
        </button>

        <button
          type="button"
          :class="{ active: listMode === 'waterfall' }"
          :disabled="!canUseWaterfall"
          aria-label="瀑布流模式"
          :aria-pressed="listMode === 'waterfall'"
          @click="changeMode('waterfall')"
        >
          <SvgIcon name="waterfall" alt="瀑布流模式" />
        </button>
      </div>
    </section>

    <template v-if="isInitialLoading">
      <LoadingSkeleton v-for="index in 3" :key="index" />
    </template>

    <div v-else-if="isEmpty" class="empty-state">暂时没有文章</div>

    <template v-else>
      <Waterfall
        v-if="listMode === 'waterfall'"
        :list="blogList.items.value"
        :columnCount="waterfallColumns"
      />
      <BlogCard
        v-else
        v-for="item in blogList.items.value"
        :key="item.id"
        v-bind="item"
      />
    </template>

    <div class="loader-btn" ref="loaderRef">
      <SunButton
        variant="primary"
        class="load-more"
        :loading="blogList.loading.value && blogList.items.value.length > 0"
        :disabled="blogList.loading.value || !blogList.hasMore.value"
        @click="loadMore"
      >
        {{
          blogList.loading.value && blogList.items.value.length > 0
            ? '正在加载...'
            : blogList.hasMore.value
              ? '加载更多'
              : '没有更多了'
        }}
      </SunButton>
    </div>
  </main>
</template>

<style scoped>
.right {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  animation: home-content-in var(--motion-duration-slow)
    var(--motion-ease-emphasized) both;
}

.summary-card {
  padding: var(--space-4);
  background-color: var(--card-bg-subtle);
  border: 1px solid var(--border-lighter);
  border-radius: var(--radius-xl);
  min-height: 6rem;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--space-2);
  box-shadow: var(--shadow-sm);
}

.tag {
  background-color: var(--bg-component);
  color: var(--text-default);
  border: 1px solid var(--border-lighter);
  min-height: 32px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-full);
  font: inherit;
  cursor: pointer;
  transition:
    background-color var(--motion-duration) var(--motion-ease-standard),
    border-color var(--motion-duration) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-standard);
}

.tag:hover,
.tag:focus-visible {
  background-color: var(--bg-raised);
  border-color: var(--border-active);
  transform: translateY(-1px);
}

.query-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 190px) auto;
  align-items: center;
  gap: var(--space-3);
}

.search-box {
  min-width: 0;
  position: relative;
}

.search-input,
.sort-select {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--input-border-color);
  border-radius: var(--radius-md);
  background: var(--bg-component);
  color: var(--text-default);
  font: inherit;
}

.search-input {
  padding: 0 2.25rem 0 var(--space-3);
}

.sort-select {
  padding: 0 var(--space-3);
}

.clear-search {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  width: 1.75rem;
  height: 1.75rem;
  transform: translateY(-50%);
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.clear-search:hover,
.clear-search:focus-visible {
  background: var(--bg-raised);
  color: var(--text-default);
}

.search-submit {
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--bg-active);
  border-radius: var(--radius-md);
  background: var(--bg-active);
  color: var(--btn-text-color);
  font: inherit;
  cursor: pointer;
}

.view-config {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-inline: var(--space-1);
}

.des {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.mode-radio {
  display: flex;
  gap: var(--space-2);
}

.mode-radio button {
  cursor: pointer;
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  background: var(--bg-component);
  transition:
    background-color var(--motion-duration) var(--motion-ease-standard),
    color var(--motion-duration) var(--motion-ease-standard),
    border-color var(--motion-duration) var(--motion-ease-standard);
}

.mode-radio button:hover:not(:disabled),
.mode-radio button:focus-visible:not(:disabled),
.mode-radio .active {
  background: var(--bg-active);
  color: var(--btn-text-color);
  border-color: var(--bg-active);
}

.mode-radio button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.empty-state {
  min-height: 180px;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: var(--card-bg-subtle);
}

.loader-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

.load-more {
  width: fit-content;
  margin: auto;
  min-width: 8rem;
}

@keyframes home-content-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media screen and (max-width: 695px) {
  .summary-card {
    margin-inline: calc(-1 * var(--space-3));
    padding-inline: var(--space-3);
    min-height: auto;
    border-inline: none;
    border-radius: 0;
    flex-wrap: nowrap;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    box-shadow: none;
  }

  .tag {
    white-space: nowrap;
    scroll-snap-align: start;
  }

  .query-panel {
    grid-template-columns: 1fr;
  }

  .search-submit {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .right {
    animation: none;
  }
}
</style>
