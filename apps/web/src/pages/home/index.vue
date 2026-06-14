<script setup lang="ts" name="content">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import BlogCard from '@/components/BlogCard/index.vue'
import SelfInfoCard from '@/components/SelfInfoCard/index.vue'
import WeatherCard from '@/components/WeatherCard/index.vue'
import Waterfall from '@/components/Waterfall/waterfall.vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'
import LoadingSkeleton from '@/shared/ui/LoadingSkeleton.vue'
import { useBlogBaseData } from '@/modules/blog/composables/useBlogBaseData'
import { useInfiniteScroll } from '@/hooks/InfiniteScroll'
import { useBreakpoint } from '@/hooks/breakpoint/breakpoint'
import { useBlogList } from '@/modules/blog/composables/useBlogList'
import {
  buildWebsiteJsonLd,
  canonicalUrl,
  useJsonLd,
  usePageMeta,
} from '@/shared/seo'

type ListModeType = 'list' | 'waterfall'

const { tagList, categoryList, loadBlogBaseData } = useBlogBaseData()
const blogList = useBlogList(tagList, categoryList)
const listMode = ref<ListModeType>('list')
const leftRef = ref<HTMLElement | null>(null)
const bottomRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const { screen } = useBreakpoint()
usePageMeta({
  title: 'Sun World',
  description:
    'Sun World 是一个记录全栈开发、AI、图形编辑器和工程实践的个人技术博客。',
  canonical: canonicalUrl('/'),
})
useJsonLd(buildWebsiteJsonLd(), 'website')

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
    ElMessage.error('获取博客列表数据失败！')
    console.error('获取博客列表数据失败', error)
  }
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
    ElMessage.error('获取博客列表数据失败！')
    console.error('获取博客列表数据失败', error)
  }

  if (!bottomRef.value) return

  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        const leftHeight = leftRef.value?.offsetHeight
        if (!leftHeight) return

        const overflow = Math.max(leftHeight - window.innerHeight, -64)
        leftRef.value?.style.setProperty('top', `${-overflow}px`)
      } else {
        leftRef.value?.style.removeProperty('top')
      }
    },
    {
      root: null,
      threshold: 0,
    }
  )
  observer.observe(bottomRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="home-page">
    <aside class="left" ref="leftRef" aria-label="个人信息与天气">
      <SelfInfoCard />
      <WeatherCard />
      <div ref="bottomRef" class="sidebar-sentinel"></div>
    </aside>

    <main class="right">
      <section class="summary-card" aria-label="文章标签">
        <button
          class="tag"
          v-for="item in tagList"
          :key="item.id"
          type="button"
        >
          {{ item.name }}
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

      <div v-else-if="isEmpty" class="empty-state">
        暂时没有文章
      </div>

      <template v-else>
        <Waterfall
          v-if="listMode === 'waterfall'"
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
        <el-button
          type="primary"
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
        </el-button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  width: 100%;
  max-width: var(--container-max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--container-inline-padding) var(--space-12);
  background:
    linear-gradient(180deg, var(--bg-accent-soft), transparent 18rem),
    var(--bg-page);
  display: grid;
  grid-template-columns: minmax(260px, 35rem) minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
  min-height: 100%;
}

.left {
  height: fit-content;
  position: sticky;
  top: 80px;
  padding-bottom: 50px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sidebar-sentinel {
  height: 2px;
}

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
  transition: background-color var(--motion-duration) var(--motion-ease-standard),
    border-color var(--motion-duration) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-standard);
}

.tag:hover,
.tag:focus-visible {
  background-color: var(--bg-raised);
  border-color: var(--border-active);
  transform: translateY(-1px);
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
  transition: background-color var(--motion-duration) var(--motion-ease-standard),
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

@media screen and (max-width: 1024px) {
  .home-page {
    grid-template-columns: 1fr;
    padding-top: var(--space-6);
  }

  .left {
    display: none;
  }
}

@media screen and (max-width: 695px) {
  .home-page {
    padding: var(--space-4) var(--space-3) var(--space-10);
    gap: var(--space-3);
  }

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
}

@media (prefers-reduced-motion: reduce) {
  .right {
    animation: none;
  }
}
</style>
