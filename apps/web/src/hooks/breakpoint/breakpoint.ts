import { ref, onMounted, onBeforeUnmount } from 'vue'
import { BREAKPOINTS, BreakpointKey } from './breakpoint.data'

export function useBreakpoint() {
  const screen = ref<BreakpointKey>('xs')

  const calcBreakpoint = () => {
    const width = window.innerWidth
    if (width < BREAKPOINTS.xs) screen.value = 'xs'
    else if (width < BREAKPOINTS.sm) screen.value = 'sm'
    else if (width < BREAKPOINTS.md) screen.value = 'md'
    else if (width < BREAKPOINTS.lg) screen.value = 'lg'
    else if (width < BREAKPOINTS.xl) screen.value = 'xl'
    else screen.value = 'xxl'
  }

  onMounted(() => {
    calcBreakpoint()
    window.addEventListener('resize', calcBreakpoint)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', calcBreakpoint)
  })

  return { screen }
}
