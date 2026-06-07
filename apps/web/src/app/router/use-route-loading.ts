import { ref, readonly, type Ref } from 'vue'
import type { Router } from 'vue-router'

/**
 * Minimal route-level loading state for page transitions.
 *
 * Tracks whether a route navigation is in progress so the app shell
 * can render a lightweight loading indicator (e.g. a top bar).
 *
 * Usage (install once in main.ts):
 *   const { isLoading } = useRouteLoading(router)
 *   provide('routeLoading', isLoading)
 *
 * Usage (consume in App.vue):
 *   const isLoading = inject<Ref<boolean>>('routeLoading')!
 */

const isLoading = ref(false)

/**
 * Attach router guards that set `isLoading` during navigation.
 *
 * Returns a frozen ref so consumers can read but not write the flag.
 * Call once at bootstrap.
 */
export function useRouteLoading(router: Router): {
  isLoading: Readonly<Ref<boolean>>
} {
  let pendingCount = 0

  router.beforeEach(() => {
    pendingCount++
    isLoading.value = true
  })

  router.afterEach(() => {
    pendingCount--
    if (pendingCount <= 0) {
      pendingCount = 0
      isLoading.value = false
    }
  })

  router.onError(() => {
    pendingCount--
    if (pendingCount <= 0) {
      pendingCount = 0
      isLoading.value = false
    }
  })

  return { isLoading: readonly(isLoading) }
}
