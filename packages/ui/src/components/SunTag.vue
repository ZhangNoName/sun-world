<script setup lang="ts">
import { computed } from 'vue'
import type { SunTagProps } from '../contracts/tag'
import { isDisabledState } from '../contracts/shared'
import '../styles/base.css'
import '../styles/tag.css'

const props = withDefaults(defineProps<SunTagProps>(), {
  disabled: false,
  state: 'default',
  color: '',
})

const isDisabled = computed(() => isDisabledState(props))
const hasLabelState = computed(() => props.state === 'label')
const tagStyle = computed(() => {
  return props.color ? { backgroundColor: props.color } : undefined
})
</script>

<template>
  <span class="sun-tag-wrap" :class="{ 'sun-ui-field--labeled': hasLabelState }">
    <span v-if="hasLabelState && label" class="sun-ui-label">{{ label }}</span>
    <span
      v-if="isDisabled || !href"
      data-sun-tag
      class="sun-tag"
      :class="{ 'sun-ui-disabled': isDisabled }"
      :style="tagStyle"
      :aria-disabled="isDisabled"
    >
      {{ label }}
    </span>
    <a
      v-else
      data-sun-tag
      class="sun-tag"
      :style="tagStyle"
      :href="href"
      target="_blank"
      rel="noopener noreferrer"
    >
      {{ label }}
    </a>
  </span>
</template>
