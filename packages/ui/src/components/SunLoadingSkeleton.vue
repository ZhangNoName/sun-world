<script setup lang="ts">
import type { SunLoadingSkeletonProps } from '../contracts/loading-skeleton'
import '../styles/base.css'
import '../styles/loading-skeleton.css'

withDefaults(defineProps<SunLoadingSkeletonProps>(), {
  lines: 3,
})
</script>

<template>
  <div class="sun-loading-skeleton" aria-hidden="true">
    <span data-sun-skeleton-line class="sun-skeleton-line sun-skeleton-line-short"></span>
    <span data-sun-skeleton-line class="sun-skeleton-line sun-skeleton-line-title"></span>
    <span
      v-for="index in lines"
      :key="index"
      data-sun-skeleton-line
      class="sun-skeleton-line"
      :class="{ 'sun-skeleton-line-muted': index === lines }"
    ></span>
  </div>
</template>
