<script setup lang="ts">
import { computed } from 'vue'

import { getUiIcon, type UiIconName } from '../data'

const iconSizes = {
  xs: 16,
  sm: 18,
  md: 20,
  lg: 24,
  xl: 28,
} as const

type IconSize = keyof typeof iconSizes

const props = withDefaults(
  defineProps<{
    name: UiIconName
    size?: IconSize | number | string
    strokeWidth?: number | string
    title?: string
    decorative?: boolean
  }>(),
  {
    size: 'md',
    strokeWidth: 2,
    decorative: true,
  }
)

const icon = computed(() => getUiIcon(props.name))
const resolvedSize = computed(() => {
  if (typeof props.size === 'string' && props.size in iconSizes) {
    return iconSizes[props.size as IconSize]
  }

  return props.size
})
</script>

<template>
  <svg
    class="sun-icon"
    :width="resolvedSize"
    :height="resolvedSize"
    :viewBox="icon.viewBox"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    :aria-hidden="decorative && !title ? 'true' : undefined"
    :role="decorative && !title ? undefined : 'img'"
  >
    <title v-if="title">{{ title }}</title>
    <component
      :is="tag"
      v-for="([tag, attrs], index) in icon.nodes"
      :key="index"
      v-bind="attrs"
    />
  </svg>
</template>
