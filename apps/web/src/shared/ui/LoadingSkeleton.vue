<template>
  <div class="loading-skeleton" aria-hidden="true">
    <span class="skeleton-line skeleton-line-short"></span>
    <span class="skeleton-line skeleton-line-title"></span>
    <span
      v-for="index in lines"
      :key="index"
      class="skeleton-line"
      :class="{ 'skeleton-line-muted': index === lines }"
    ></span>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    lines?: number
  }>(),
  {
    lines: 3,
  }
)
</script>

<style scoped>
.loading-skeleton {
  border: 1px solid var(--border-default);
  border-radius: var(--card-radius);
  background: var(--bg-brand-light);
  padding: var(--card-padding);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 168px;
  overflow: hidden;
}

.skeleton-line {
  display: block;
  height: 12px;
  border-radius: var(--radius-full);
  background: linear-gradient(
    90deg,
    var(--color-surface-muted) 0%,
    var(--color-surface-card) 45%,
    var(--color-surface-muted) 90%
  );
  background-size: 240% 100%;
  animation: skeleton-shimmer 1.3s var(--motion-ease-standard) infinite;
}

.skeleton-line-short {
  width: 34%;
}

.skeleton-line-title {
  width: 72%;
  height: 18px;
}

.skeleton-line-muted {
  width: 58%;
}

@keyframes skeleton-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line {
    animation: none;
  }
}
</style>
