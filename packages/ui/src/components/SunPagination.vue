<script setup lang="ts">
import { computed } from 'vue'
import type { SunPaginationProps } from '../contracts/pagination'
import { isDisabledState, isLabelState } from '../contracts/shared'
import '../styles/base.css'
import '../styles/pagination.css'

const props = withDefaults(defineProps<SunPaginationProps>(), {
  disabled: false,
  mobile: false,
  loading: false,
  hasMore: true,
  autoLoadOnReachEnd: false,
  state: 'default',
})

const emit = defineEmits<{
  'update:page': [page: number]
  pageChange: [page: number]
  loadMore: []
}>()

const isDisabled = computed(() => isDisabledState(props) || props.loading)
const hasLabel = computed(() => isLabelState(props))
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const pages = computed(() => {
  return Array.from({ length: pageCount.value }, (_, index) => index + 1)
})

function changePage(page: number) {
  if (isDisabled.value || page === props.page) return
  emit('update:page', page)
  emit('pageChange', page)
}

function loadMore() {
  if (isDisabled.value || !props.hasMore) return
  emit('loadMore')
}

function handleMobileScroll(event: Event) {
  if (!props.autoLoadOnReachEnd || isDisabled.value || !props.hasMore) return
  const target = event.currentTarget as HTMLElement
  const reachedEnd = target.scrollTop + target.clientHeight >= target.scrollHeight - 4
  if (reachedEnd) {
    emit('loadMore')
  }
}
</script>

<template>
  <nav class="sun-pagination" :aria-label="ariaLabel || label || 'Pagination'">
    <div v-if="hasLabel" class="sun-ui-label">{{ label }}</div>
    <div
      v-if="mobile"
      data-sun-pagination-scroll
      class="sun-pagination__mobile-scroll"
      @scroll="handleMobileScroll"
    >
      <button
        data-sun-load-more
        class="sun-pagination__load-more"
        type="button"
        :disabled="isDisabled || !hasMore"
        :aria-busy="loading || undefined"
        @click="loadMore"
      >
        {{ hasMore ? 'Load more' : 'No more' }}
      </button>
    </div>
    <div v-else class="sun-pagination__pages">
      <button
        v-for="pageNumber in pages"
        :key="pageNumber"
        type="button"
        class="sun-pagination__page"
        :class="{ 'is-active': pageNumber === page }"
        :data-sun-page="pageNumber"
        :disabled="isDisabled"
        @click="changePage(pageNumber)"
      >
        {{ pageNumber }}
      </button>
    </div>
  </nav>
</template>
