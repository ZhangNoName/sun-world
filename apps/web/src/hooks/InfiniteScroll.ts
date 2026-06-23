import { ref, onMounted, onUnmounted, unref, watch, type Ref } from 'vue'

type MaybeReactive<T> = T | Ref<T>
type ScrollRoot = HTMLElement | null | (() => HTMLElement | null)

interface Options {
  /** Enable or pause infinite loading. */
  enabled?: MaybeReactive<boolean>
  /** Distance before the loader that should trigger loading. */
  rootMargin?: string
  /** Scroll container; defaults to the viewport. */
  root?: ScrollRoot
}

/**
 * Vue 3 infinite scroll hook.
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void> | void,
  options: Options = {}
) {
  const { enabled = true, root = null, rootMargin = '100px' } = options

  const loaderRef: Ref<HTMLElement | null> = ref(null)
  const loading = ref(false)
  const hasMore = ref(true)

  let observer: IntersectionObserver | null = null

  const isEnabled = () => unref(enabled)
  const resolveRoot = () => (typeof root === 'function' ? root() : root)

  const stopObserve = () => {
    if (observer && loaderRef.value) {
      observer.unobserve(loaderRef.value)
      observer.disconnect()
    }
    observer = null
  }

  const startObserve = () => {
    if (!isEnabled() || !loaderRef.value || observer) return

    observer = new IntersectionObserver(
      async (entries) => {
        if (
          entries[0].isIntersecting &&
          isEnabled() &&
          !loading.value &&
          hasMore.value
        ) {
          loading.value = true

          try {
            await loadMore()
          } finally {
            loading.value = false
          }
        }
      },
      {
        root: resolveRoot(),
        rootMargin,
      }
    )

    observer.observe(loaderRef.value)
  }

  onMounted(() => {
    startObserve()
  })

  watch(
    () => isEnabled(),
    (nextEnabled) => {
      if (nextEnabled) {
        startObserve()
      } else {
        stopObserve()
      }
    }
  )

  onUnmounted(() => {
    stopObserve()
  })

  return {
    loaderRef,
    loading,
    hasMore,
  }
}
