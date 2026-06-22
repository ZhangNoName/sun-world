<script setup lang="ts">
import SunIcon from './SunIcon.vue'
import type { UiIconName } from '../data'

withDefaults(
  defineProps<{
    icon: UiIconName
    label: string
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number | string
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  {
    size: 'lg',
    type: 'button',
    disabled: false,
  }
)
</script>

<template>
  <button
    class="sun-icon-button"
    :type="type"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <SunIcon :name="icon" :size="size" />
  </button>
</template>
