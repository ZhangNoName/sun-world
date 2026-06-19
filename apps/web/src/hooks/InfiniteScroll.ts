import { ref, onMounted, onUnmounted, Ref, watch } from 'vue'

interface Options {
  /** 是否启用滚动加载 */
  enabled?: boolean
  /** 提前触发的距离 (px)，默认 100px */
  rootMargin?: string
  /** 容器，默认使用 window */
  root?: HTMLElement | null
}

/**
 * Vue 3 无限滚动 Hook
 * @param loadMore 加载更多回调
 * @param options 配置项
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void> | void,
  options: Options = {}
) {
  const { enabled = true, root = null, rootMargin = '100px' } = options

  const loaderRef: Ref<HTMLElement | null> = ref(null)
  let loading = ref(false)
  const hasMore = ref(true) // 外部可控

  let observer: IntersectionObserver | null = null

  const startObserve = () => {
    if (!enabled || !loaderRef.value) return

    observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && !loading.value && hasMore.value) {
          loading.value = true

          try {
            await loadMore()
          } finally {
            loading.value = false
          }
        }
      },
      {
        root,
        rootMargin,
      }
    )

    observer.observe(loaderRef.value)
  }

  onMounted(() => {
    startObserve()
  })

  onUnmounted(() => {
    if (observer && loaderRef.value) {
      observer.unobserve(loaderRef.value)
      observer.disconnect()
    }
  })

  return {
    loaderRef, // 放在列表末尾的占位元素
    loading,
    hasMore, // 可以在外部修改
  }
}
