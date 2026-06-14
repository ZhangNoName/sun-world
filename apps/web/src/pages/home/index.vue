<script setup lang="ts" name="content">
import { onMounted, onUnmounted, ref } from 'vue'
import SelfInfoCard from '@/modules/blog/ui/SelfInfoCard.vue'
import WeatherCard from '@/components/WeatherCard/index.vue'
import BlogHomeFeed from '@/modules/blog/ui/BlogHomeFeed.vue'
import {
  buildWebsiteJsonLd,
  canonicalUrl,
  useJsonLd,
  usePageMeta,
} from '@/shared/seo'

const leftRef = ref<HTMLElement | null>(null)
const bottomRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

usePageMeta({
  title: 'Sun World',
  description:
    'Sun World 是一个记录全栈开发、AI、图形编辑器和工程实践的个人技术博客。',
  canonical: canonicalUrl('/'),
})
useJsonLd(buildWebsiteJsonLd(), 'website')

onMounted(() => {
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

    <BlogHomeFeed />
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
}
</style>
